#!/usr/bin/env python3
"""
完整的 Qwen-Audio STT 功能测试
验证：
1. 模型加载（通过 FunASR）
2. 音频转录
3. 结果格式
"""

import os
import sys
import json
from pathlib import Path

# 添加项目路径
sys.path.insert(0, '/home/niuma/小玲/UI/backend')

def test_qwen_audio_loading():
    """测试 Qwen-Audio 模型加载"""
    print("\n" + "="*60)
    print("测试 1: Qwen-Audio 模型加载 (通过 FunASR)")
    print("="*60)
    
    try:
        from open_webui.utils.stt_models import ModelScopeQwenAudioModel
        
        print("初始化模型...")
        model = ModelScopeQwenAudioModel(
            model_id="qwen-audio",
            device="cpu"
        )
        
        print("加载模型...")
        model.load()
        
        print("✓ 模型加载成功")
        print(f"   Model 类型: {type(model.model).__name__}")
        return model
        
    except Exception as e:
        print(f"✗ 模型加载失败: {type(e).__name__}")
        print(f"错误信息: {str(e)[:200]}")
        return None


def generate_test_audio():
    """生成测试音频文件"""
    print("\n" + "="*60)
    print("测试 2: 生成测试音频")
    print("="*60)
    
    try:
        import numpy as np
        import librosa
        import soundfile as sf
        
        print("生成 3 秒的正弦波音频...")
        sr = 16000
        duration = 3
        t = np.linspace(0, duration, int(sr * duration), False)
        # 多个频率混合，模拟语音（不是真实语音，但可用于测试）
        audio = (
            0.3 * np.sin(2 * np.pi * 440 * t) +  # A4
            0.2 * np.sin(2 * np.pi * 880 * t) +  # A5
            0.1 * np.sin(2 * np.pi * 1320 * t)   # E6
        )
        
        output_path = "/tmp/test_audio.wav"
        sf.write(output_path, audio, sr)
        
        print(f"✓ 音频生成成功: {output_path}")
        print(f"   采样率: {sr} Hz")
        print(f"   时长: {duration} 秒")
        print(f"   文件大小: {os.path.getsize(output_path) / 1024:.1f} KB")
        return output_path
        
    except ImportError:
        print("⚠ soundfile 未安装，尝试使用 librosa...")
        try:
            import librosa
            print("创建简单的音频文件...")
            # 使用 librosa 生成测试信号
            sr = 16000
            duration = 3
            audio = np.zeros(sr * duration)
            output_path = "/tmp/test_audio.wav"
            librosa.output.write_wav(output_path, audio, sr)
            print(f"✓ 空白音频生成成功: {output_path}")
            return output_path
        except Exception as e:
            print(f"✗ 音频生成失败: {e}")
            return None


def test_transcription(model, audio_path):
    """测试转录功能"""
    print("\n" + "="*60)
    print("测试 3: 音频转录")
    print("="*60)
    
    if model is None:
        print("✗ 模型未加载，跳过测试")
        return None
    
    if not os.path.exists(audio_path):
        print(f"✗ 音频文件不存在: {audio_path}")
        return None
    
    try:
        print(f"转录文件: {audio_path}")
        result = model.transcribe(audio_path, language="zh", stt_profile="artifact")
        
        print("✓ 转录成功")
        print(f"   返回类型: {type(result).__name__}")
        print(f"   关键字段: {list(result.keys())}")
        print(f"   转录文本: {result.get('text', '')[:100]}")
        print(f"   检测语言: {result.get('detected_language', 'N/A')}")
        print(f"   分段数: {len(result.get('segments', []))}")
        
        return result
        
    except Exception as e:
        print(f"✗ 转录失败: {type(e).__name__}")
        print(f"错误信息: {str(e)[:300]}")
        return None


def test_factory():
    """测试工厂模式"""
    print("\n" + "="*60)
    print("测试 4: STT 工厂模式")
    print("="*60)
    
    try:
        from open_webui.utils.stt_models import STTModelFactory
        
        print("通过工厂创建 Qwen-Audio 模型...")
        model = STTModelFactory.get_model(
            model_id="qwen-audio",
            model_type="qwen-audio",
            device="cpu"
        )
        
        print("✓ 工厂模式成功")
        print(f"   Model 类型: {type(model).__name__}")
        print(f"   Model ID: {model.model_id}")
        
        return model
        
    except Exception as e:
        print(f"✗ 工厂模式失败: {type(e).__name__}")
        print(f"错误信息: {str(e)[:200]}")
        return None


def main():
    print("\n" + "="*60)
    print("Qwen-Audio 完整功能测试")
    print("="*60)
    print(f"时间: {os.popen('date').read().strip()}")
    print(f"Python 版本: {sys.version.split()[0]}")
    print(f"工作目录: {os.getcwd()}")
    
    # 测试 1: 模型加载
    model = test_qwen_audio_loading()
    
    # 测试 2: 工厂模式
    factory_model = test_factory()
    
    # 测试 3: 生成测试音频
    audio_path = generate_test_audio()
    
    # 测试 4: 转录
    if audio_path:
        result = test_transcription(model, audio_path)
    
    print("\n" + "="*60)
    print("测试完成!")
    print("="*60)


if __name__ == "__main__":
    main()
