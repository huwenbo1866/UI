# Qwen-Audio Integration Guide

## Overview

This guide explains how to use the new Qwen-Audio integration for Chinese speech-to-text (STT) in Open WebUI.

## Background

The STT framework has been refactored to support multiple STT backends:
- **faster-whisper** (default): English-optimized, works well for multilingual content
- **qwen-audio**: Chinese-optimized, better accuracy for Mandarin Chinese

## Architecture

### STT Model Framework

Located in: `/backend/open_webui/utils/stt_models.py`

The framework consists of:
- `STTModel` (abstract base class): Defines the interface for all STT models
- `FastWhisperModel`: Wrapper for faster-whisper implementation
- `ModelScopeQwenAudioModel`: Wrapper for Qwen-Audio via HuggingFace Transformers
- `STTModelFactory`: Factory class for model instantiation and caching

### Key Components

```
STTModel (base)
├── FastWhisperModel
│   └── Uses: faster-whisper library
│   └── Input: WAV/MP3 audio files
│   └── Output: Transcription with segments and language detection
│
├── ModelScopeQwenAudioModel
│   └── Uses: HuggingFace Transformers (Qwen2AudioForConditionalGeneration)
│   └── Input: WAV/MP3 audio files
│   └── Output: Transcription (Chinese-optimized)
│
└── STTModelFactory
    └── Manages model loading and caching
    └── Model mapping: Maps friendly names to implementations
```

## Configuration

### Environment Variables

Add to `.env`:

```bash
# STT Engine selection
AUDIO_STT_ENGINE=              # leave empty for local processing

# STT Model Type: 'faster-whisper' (default) or 'qwen-audio'
STT_MODEL_TYPE=faster-whisper

# For faster-whisper only
AUDIO_STT_MODEL=base           # or: tiny, small, medium, large-v2, large-v3
WHISPER_COMPUTE_TYPE=int8     # or: float32, float16, int16
WHISPER_VAD_FILTER=true       # Voice Activity Detection
WHISPER_MULTILINGUAL=true     # Enable multilingual support
WHISPER_LANGUAGE=zh           # Auto-detect (leave empty) or specify language
```

### Docker Compose

To enable Qwen-Audio in Docker, ensure GPU support:

```yaml
services:
  open-webui:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      STT_MODEL_TYPE: qwen-audio  # Use Qwen-Audio instead of Whisper
      TORCH_DEVICE_TYPE: cuda     # Enable GPU
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
```

## Usage

### API Endpoint

POST `/api/v1/audio/transcriptions`

```python
import requests

# Transcribe audio file
with open('audio.wav', 'rb') as f:
    files = {'file': f}
    data = {
        'model': 'base',  # for faster-whisper
        'language': 'zh',  # optional, auto-detect if not specified
        'stt_profile': 'artifact'  # or 'interactive' for low-latency
    }
    
    response = requests.post(
        'http://localhost:8000/api/v1/audio/transcriptions',
        files=files,
        data=data
    )
    
    result = response.json()
    print(result['text'])  # Transcribed text
```

### Response Format

All STT models return a standardized response:

```json
{
  "text": "转录的文本",
  "detected_language": "zh",
  "segments": [
    {
      "start_ms": 0,
      "end_ms": 1500,
      "text": "第一句话"
    },
    {
      "start_ms": 1500,
      "end_ms": 3000,
      "text": "第二句话"
    }
  ]
}
```

## Performance Comparison

| Aspect | faster-whisper | Qwen-Audio |
|--------|---|---|
| Language Focus | Multilingual (English-optimized) | Chinese-optimized |
| Accuracy (Chinese) | Good | Excellent |
| Speed (CPU) | Fast | Slower |
| Speed (GPU) | Very Fast | Very Fast |
| Memory (base) | ~1GB | ~3GB |
| GPU Memory | ~2-4GB | ~6-10GB |

## Installation & Setup

### Prerequisites

```bash
# Ensure you have the required packages
conda activate open-webui

pip install faster-whisper>=1.0  # Already installed
pip install transformers>=4.40    # For Qwen-Audio
pip install librosa>=0.10.0       # For audio loading
pip install soundfile              # Alternative audio loading
```

### First Run

When you first use Qwen-Audio, it will download the model:

```bash
# Download model (one-time, ~2-3GB)
python -c "
from open_webui.utils.stt_models import STTModelFactory

model = STTModelFactory.get_model(
    model_id='Qwen-Audio',
    model_type='qwen-audio',
    device='cuda'  # or 'cpu'
)
print('Model loaded successfully')
"
```

### Model Caching

Models are cached in:
- **faster-whisper**: `$WHISPER_MODEL_DIR` (default: `./data/cache/whisper/models`)
- **Qwen-Audio**: `~/.cache/huggingface/hub/` (HuggingFace cache)

To pre-download models:

```bash
# Pre-download whisper models
python -c "from faster_whisper import WhisperModel; WhisperModel('base')"

# Pre-download Qwen-Audio models
python -c "from transformers import AutoModel; AutoModel.from_pretrained('Qwen/Qwen-Audio')"
```

## Switching Models at Runtime

You can change STT models without restarting:

```python
# Change to faster-whisper
model = STTModelFactory.get_model(
    model_id='base',
    model_type='faster-whisper'
)

# Later, switch to Qwen-Audio
model = STTModelFactory.get_model(
    model_id='Qwen-Audio',
    model_type='qwen-audio',
    device='cuda'  # or 'cpu'
)

# Models are cached, so switching back is instant
```

## Troubleshooting

### Out of Memory

If you get OOM errors with Qwen-Audio on CPU:

```bash
# Try with smaller model or quantization
# Currently using full precision float32/float16

# On GPU, reduce batch size (if using batched processing)
TORCH_DEVICE_TYPE=cuda
```

### Network Issues

If model download fails:

```bash
# Set proxy if behind corporate firewall
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=http://proxy.company.com:8080

# Or disable network access and use local cache only
STT_MODEL_TYPE=faster-whisper  # Use pre-downloaded model
WHISPER_MODEL=base
```

### Model Download Stuck

If downloading takes too long:

```bash
# Check progress in another terminal
df -h ~/.cache/huggingface/

# Or use offline mode with pre-downloaded models
# Set local_files_only=True in code
```

## Future Enhancements

Planned additions to the STT framework:
- [ ] FunASR support (Alibaba's model)
- [ ] SenseVoice support (for multi-language with emotion)
- [ ] Paraformer support
- [ ] Batch processing for multiple files
- [ ] Real-time streaming transcription
- [ ] Model quantization for faster inference
- [ ] Custom fine-tuned models

## Related Files

- Framework: [stt_models.py](./open_webui/utils/stt_models.py)
- API Routes: [audio.py](./routers/audio.py)
- Configuration: [config.py](./config.py)
- Tests: [test_stt_integration.py](../test_stt_integration.py)

## References

- [faster-whisper Documentation](https://github.com/SYSTRAN/faster-whisper)
- [Qwen-Audio Model Card](https://huggingface.co/Qwen/Qwen-Audio)
- [Transformers Library](https://huggingface.co/docs/transformers/)
