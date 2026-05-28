"""
STT (Speech-to-Text) 模型加载和管理框架
支持多种后端：faster-whisper, modelscope (Qwen-Audio/paraformer), funasr等
"""

import logging
import os
from typing import Optional, Dict, Any, Tuple, List
from pathlib import Path

log = logging.getLogger(__name__)


class STTModel:
    """STT 模型的抽象基类"""
    
    def __init__(self, model_id: str, **kwargs):
        self.model_id = model_id
        self.kwargs = kwargs
        self.model = None
    
    def load(self):
        """加载模型，由子类实现"""
        raise NotImplementedError
    
    def transcribe(self, audio_path: str, language: Optional[str] = None, **kwargs) -> Dict[str, Any]:
        """
        转录音频文件
        返回格式: {
            "text": "转录文本",
            "detected_language": "zh",
            "segments": [
                {"start_ms": 0, "end_ms": 1000, "text": "..."},
                ...
            ]
        }
        """
        raise NotImplementedError
    
    def unload(self):
        """卸载模型"""
        if self.model is not None:
            self.model = None


class FastWhisperModel(STTModel):
    """基于 faster-whisper 的 STT 模型"""
    
    def load(self):
        if self.model is not None:
            return
        
        try:
            from faster_whisper import WhisperModel
            
            device = self.kwargs.get("device", "cpu")
            compute_type = self.kwargs.get("compute_type", "int8")
            download_root = self.kwargs.get("download_root", None)
            local_files_only = self.kwargs.get("local_files_only", False)
            
            try:
                self.model = WhisperModel(
                    model_size_or_path=self.model_id,
                    device=device,
                    compute_type=compute_type,
                    download_root=download_root,
                    local_files_only=local_files_only,
                )
            except Exception as initial_error:
                # 如果首次加载失败，尝试使用本地缓存
                if not local_files_only:
                    log.warning(f"Download failed, trying local cache: {initial_error}")
                    self.model = WhisperModel(
                        model_size_or_path=self.model_id,
                        device=device,
                        compute_type=compute_type,
                        download_root=download_root,
                        local_files_only=True,
                    )
                else:
                    raise initial_error
            
            log.info(f"Loaded faster-whisper model: {self.model_id}")
        except Exception as e:
            log.error(f"Failed to load faster-whisper model {self.model_id}: {e}")
            raise
    
    def transcribe(self, audio_path: str, language: Optional[str] = None, stt_profile: str = "interactive", **kwargs) -> Dict[str, Any]:
        if self.model is None:
            self.load()
        
        try:
            # 准备转录参数
            whisper_kwargs = {
                "language": language,
                "multilingual": self.kwargs.get("multilingual", False),
            }
            
            if stt_profile == "interactive":
                whisper_kwargs.update({
                    "beam_size": 1,
                    "vad_filter": False,
                    "condition_on_previous_text": False,
                })
            else:
                whisper_kwargs.update({
                    "beam_size": 5,
                    "vad_filter": self.kwargs.get("vad_filter", False),
                    "condition_on_previous_text": True,
                })
            
            segments_iter, info = self.model.transcribe(audio_path, **whisper_kwargs)
            
            segment_items = []
            transcript_parts = []
            
            for segment in segments_iter:
                text = (segment.text or "").strip()
                if not text:
                    continue
                
                transcript_parts.append(text)
                segment_items.append({
                    "start_ms": int(segment.start * 1000),
                    "end_ms": int(segment.end * 1000),
                    "text": text,
                })
            
            return {
                "text": " ".join(transcript_parts).strip(),
                "detected_language": info.language,
                "segments": segment_items,
            }
        except Exception as e:
            log.error(f"Error transcribing with faster-whisper: {e}")
            raise


class ModelScopeQwenAudioModel(STTModel):
    """基于 HuggingFace Transformers 的 Qwen-Audio STT 模型"""
    
    def __init__(self, model_id: str, device: str = "cpu", **kwargs):
        super().__init__(model_id, **kwargs)
        self.device = device
        self.processor = None
        self.model_name = kwargs.get("model_name", "Qwen/Qwen-Audio")
    
    def load(self):
        if self.model is not None:
            return
        
        try:
            from transformers import AutoProcessor, Qwen2AudioForConditionalGeneration
            import torch
            
            # 加载处理器
            self.processor = AutoProcessor.from_pretrained(
                self.model_name,
                trust_remote_code=True,
            )
            
            # 根据设备类型设置精度
            torch_dtype = torch.float16 if self.device == "cuda" else torch.float32
            
            # 加载模型
            self.model = Qwen2AudioForConditionalGeneration.from_pretrained(
                self.model_name,
                torch_dtype=torch_dtype,
                device_map=self.device,
                trust_remote_code=True,
            )
            
            log.info(f"Loaded Qwen-Audio model: {self.model_name}")
        except Exception as e:
            log.error(f"Failed to load Qwen-Audio model {self.model_name}: {e}")
            raise
    
    def transcribe(self, audio_path: str, language: Optional[str] = None, stt_profile: str = "artifact", **kwargs) -> Dict[str, Any]:
        if self.model is None:
            self.load()
        
        try:
            import librosa
            import torch
            
            # 加载音频文件
            waveform, sr = librosa.load(audio_path, sr=None)
            
            # 使用处理器处理音频
            audio_dict = self.processor(
                audios=waveform,
                sampling_rate=sr,
                return_tensors="pt"
            )
            
            # 移至指定设备
            audio_dict = {k: v.to(self.device) if hasattr(v, 'to') else v for k, v in audio_dict.items()}
            
            # 生成转录
            with torch.no_grad():
                output_ids = self.model.generate(
                    **audio_dict,
                    max_new_tokens=128,
                )
            
            # 解码结果
            transcription = self.processor.batch_decode(
                output_ids,
                skip_special_tokens=True
            )[0]
            
            # 返回标准化格式
            return {
                "text": transcription.strip(),
                "detected_language": language or "zh",
                "segments": [{
                    "start_ms": 0,
                    "end_ms": 0,
                    "text": transcription.strip(),
                }],
            }
        except Exception as e:
            log.error(f"Error transcribing with Qwen-Audio: {e}")
            raise
    
    def unload(self):
        if self.model is not None:
            del self.model
            del self.processor
            self.model = None
            self.processor = None
            log.info("Unloaded Qwen-Audio model")


class STTModelFactory:
    """STT 模型工厂类"""
    
    _models: Dict[str, STTModel] = {}
    
    MODEL_MAPPING = {
        # faster-whisper 模型
        "whisper-tiny": ("faster-whisper", "tiny"),
        "whisper-base": ("faster-whisper", "base"),
        "whisper-small": ("faster-whisper", "small"),
        "whisper-medium": ("faster-whisper", "medium"),
        "whisper-large-v2": ("faster-whisper", "large-v2"),
        "whisper-large-v3": ("faster-whisper", "large-v3"),
        
        # ModelScope Qwen-Audio
        "qwen-audio": ("qwen-audio", "damo/speech_recognition_qwen_chinese"),
        
        # 别名支持
        "base": ("faster-whisper", "base"),
    }
    
    @classmethod
    def get_model(
        cls,
        model_id: str,
        model_type: Optional[str] = None,
        device: str = "cpu",
        compute_type: str = "int8",
        download_root: Optional[str] = None,
        **kwargs
    ) -> STTModel:
        """
        获取或创建 STT 模型
        
        Args:
            model_id: 模型标识符（如 "base", "qwen-audio"）
            model_type: 模型类型（"faster-whisper", "qwen-audio"）。如果为 None，会自动检测
            device: 计算设备（"cpu" 或 "cuda"）
            compute_type: 计算精度（仅 faster-whisper）
            download_root: 模型下载目录
        
        Returns:
            STTModel 实例
        """
        
        # 如果 model_id 不在 MODEL_MAPPING 中，尝试直接使用
        if model_id not in cls.MODEL_MAPPING and model_type is None:
            # 假设是 faster-whisper 模型
            model_type = "faster-whisper"
            actual_model_id = model_id
        elif model_id in cls.MODEL_MAPPING:
            model_type, actual_model_id = cls.MODEL_MAPPING[model_id]
        else:
            actual_model_id = model_id
        
        # 使用缓存的模型
        cache_key = f"{model_type}:{actual_model_id}:{device}"
        if cache_key in cls._models:
            return cls._models[cache_key]
        
        # 创建新模型实例
        kwargs_dict = {
            "device": device,
            **kwargs
        }
        
        if model_type == "faster-whisper":
            kwargs_dict["compute_type"] = compute_type
            if download_root:
                kwargs_dict["download_root"] = download_root
            model = FastWhisperModel(actual_model_id, **kwargs_dict)
        
        elif model_type == "qwen-audio":
            model = ModelScopeQwenAudioModel(actual_model_id, **kwargs_dict)
        
        else:
            raise ValueError(f"Unknown model type: {model_type}")
        
        # 加载模型
        model.load()
        
        # 缓存
        cls._models[cache_key] = model
        
        return model
    
    @classmethod
    def clear_models(cls):
        """清空所有缓存的模型"""
        for model in cls._models.values():
            model.unload()
        cls._models.clear()
        log.info("Cleared all cached STT models")
    
    @classmethod
    def list_available_models(cls) -> Dict[str, Tuple[str, str]]:
        """列出可用的模型"""
        return cls.MODEL_MAPPING.copy()


# 便捷函数
def transcribe_audio(
    audio_path: str,
    model_id: str = "base",
    model_type: Optional[str] = None,
    device: str = "cpu",
    language: Optional[str] = None,
    stt_profile: str = "interactive",
    **kwargs
) -> Dict[str, Any]:
    """
    快捷转录函数
    
    Args:
        audio_path: 音频文件路径
        model_id: 模型 ID（如 "base", "qwen-audio"）
        model_type: 模型类型（可选）
        device: 计算设备
        language: 语言代码
        stt_profile: STT 场景（"interactive" 或 "artifact"）
    
    Returns:
        转录结果
    """
    model = STTModelFactory.get_model(
        model_id=model_id,
        model_type=model_type,
        device=device,
        **kwargs
    )
    return model.transcribe(audio_path, language=language, stt_profile=stt_profile)
