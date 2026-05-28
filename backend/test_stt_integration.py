#!/usr/bin/env python3
"""
STT Integration Test Script
用于测试 STT 框架的集成情况
"""

import os
import sys
import json
from pathlib import Path

# 添加后端路径
sys.path.insert(0, str(Path(__file__).parent))

def test_framework_import():
    """测试框架导入"""
    print("\n" + "="*60)
    print("TEST 1: Framework Import")
    print("="*60)
    
    try:
        from open_webui.utils.stt_models import STTModelFactory
        print("✓ STT Model Framework imported successfully")
        return True
    except Exception as e:
        print(f"✗ Failed to import framework: {e}")
        return False


def test_model_listing():
    """测试模型列表"""
    print("\n" + "="*60)
    print("TEST 2: Available Models")
    print("="*60)
    
    try:
        from open_webui.utils.stt_models import STTModelFactory
        
        models = STTModelFactory.list_available_models()
        print(f"✓ Found {len(models)} models:")
        
        for name, (model_type, model_id) in list(models.items()):
            print(f"  - {name:20} ({model_type:15}): {model_id}")
        
        return True
    except Exception as e:
        print(f"✗ Failed to list models: {e}")
        return False


def test_faster_whisper_loading():
    """测试 faster-whisper 模型加载"""
    print("\n" + "="*60)
    print("TEST 3: Load faster-whisper Model")
    print("="*60)
    
    try:
        from open_webui.utils.stt_models import STTModelFactory
        
        print("🔄 Loading faster-whisper base model...")
        
        # 设置环境变量
        os.environ['HUGGINGFACE_HUB_CACHE'] = '/home/niuma/小玲/UI/backend/data/cache/whisper/models'
        
        model = STTModelFactory.get_model(
            model_id='base',
            model_type='faster-whisper',
            device='cpu',
            compute_type='int8',
            download_root='/home/niuma/小玲/UI/backend/data/cache/whisper/models',
            local_files_only=True,
        )
        
        print(f"✓ faster-whisper model loaded: {model.__class__.__name__}")
        print(f"  Model ID: {model.model_id}")
        print(f"  Device: cpu")
        print(f"  Compute Type: int8")
        
        return True, model
    except Exception as e:
        print(f"✗ Failed to load faster-whisper: {e}")
        import traceback
        traceback.print_exc()
        return False, None


def test_faster_whisper_transcription(model):
    """测试 faster-whisper 转录"""
    print("\n" + "="*60)
    print("TEST 4: faster-whisper Transcription")
    print("="*60)
    
    # 找一个音频文件
    audio_file = '/home/niuma/小玲/UI/backend/data/uploads/c8b2fe0b-7499-4dc4-94d6-1c91ff11c0ef_SVID_20260226_143615_1_QQ浏览器视频压缩_stt.wav'
    
    if not os.path.exists(audio_file):
        print(f"✗ Audio file not found: {audio_file}")
        return False
    
    try:
        print(f"🔄 Transcribing: {os.path.basename(audio_file)}")
        
        result = model.transcribe(
            audio_path=audio_file,
            language='zh',
            stt_profile='artifact',
        )
        
        print(f"✓ Transcription successful")
        print(f"  Text: {result.get('text', '')[:100]}...")
        print(f"  Language: {result.get('detected_language', 'unknown')}")
        print(f"  Segments: {len(result.get('segments', []))}")
        
        return True
    except Exception as e:
        print(f"✗ Transcription failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_qwen_audio_check():
    """检查 Qwen-Audio 模型依赖"""
    print("\n" + "="*60)
    print("TEST 5: Check Qwen-Audio Dependencies")
    print("="*60)
    
    deps_ok = True
    
    # 检查必要的模块
    modules = {
        'transformers': 'Qwen2AudioForConditionalGeneration, AutoProcessor',
        'librosa': 'Audio loading',
        'torch': 'PyTorch backend',
    }
    
    for module_name, description in modules.items():
        try:
            __import__(module_name)
            print(f"✓ {module_name:15} ({description})")
        except ImportError:
            print(f"✗ {module_name:15} ({description}) - NOT INSTALLED")
            deps_ok = False
    
    # 检查 Qwen2AudioForConditionalGeneration
    try:
        from transformers import Qwen2AudioForConditionalGeneration
        print(f"✓ Qwen2AudioForConditionalGeneration available in transformers")
    except ImportError:
        print(f"✗ Qwen2AudioForConditionalGeneration NOT available")
        deps_ok = False
    
    return deps_ok


def main():
    """运行所有测试"""
    print("\n" + "╔" + "="*58 + "╗")
    print("║" + " "*58 + "║")
    print("║" + " "*12 + "STT Framework Integration Test".center(56) + "║")
    print("║" + " "*58 + "║")
    print("╚" + "="*58 + "╝")
    
    results = {
        "Framework Import": test_framework_import(),
        "Model Listing": test_model_listing(),
    }
    
    # 测试 faster-whisper
    success, model = test_faster_whisper_loading()
    results["Load faster-whisper"] = success
    
    if success and model:
        results["faster-whisper Transcription"] = test_faster_whisper_transcription(model)
    
    # 检查 Qwen-Audio 依赖
    results["Qwen-Audio Dependencies"] = test_qwen_audio_check()
    
    # 总结
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    
    for test_name, result in results.items():
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"{status:8} {test_name}")
    
    all_passed = all(results.values())
    
    print("\n" + "="*60)
    if all_passed:
        print("✓ All tests passed!")
    else:
        print("✗ Some tests failed. Please check the output above.")
    print("="*60 + "\n")
    
    return all_passed


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
