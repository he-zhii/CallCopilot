class AudioCapture {
    constructor() {
        this.audioContext = null;
        this.mediaStream = null;
        this.scriptProcessor = null;
        this.isRecording = false;
        this.targetSampleRate = 16000;
        this.onAudioData = null;
    }

    async start() {
        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                } 
            });

            const sourceSampleRate = this.mediaStream.getAudioTracks()[0].getSettings().sampleRate || 44100;
            console.log('[AudioCapture] 原始采样率:', sourceSampleRate);

            this.audioContext = new AudioContext({ sampleRate: sourceSampleRate });
            
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            const source = this.audioContext.createMediaStreamSource(this.mediaStream);
            const bufferSize = 4096;
            
            this.scriptProcessor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
            
            this.scriptProcessor.onaudioprocess = (event) => {
                if (!this.isRecording) return;
                
                const inputData = event.inputBuffer.getChannelData(0);
                const resampledData = this.resample(inputData, sourceSampleRate, this.targetSampleRate);
                const pcmData = this.floatTo16BitPCM(resampledData);
                
                if (this.onAudioData) {
                    this.onAudioData(pcmData);
                }
            };

            source.connect(this.scriptProcessor);
            this.scriptProcessor.connect(this.audioContext.destination);
            
            this.isRecording = true;
            console.log('[AudioCapture] 开始采集音频');
            
            return true;
        } catch (error) {
            console.error('[AudioCapture] 启动失败:', error);
            throw error;
        }
    }

    resample(input, fromRate, toRate) {
        if (fromRate === toRate) {
            return input;
        }
        
        const ratio = fromRate / toRate;
        const outputLength = Math.round(input.length / ratio);
        const output = new Float32Array(outputLength);
        
        for (let i = 0; i < outputLength; i++) {
            const srcIndex = i * ratio;
            const srcIndexFloor = Math.floor(srcIndex);
            const weight = srcIndex - srcIndexFloor;
            
            if (srcIndexFloor + 1 < input.length) {
                output[i] = input[srcIndexFloor] * (1 - weight) + input[srcIndexFloor + 1] * weight;
            } else {
                output[i] = input[srcIndexFloor] || 0;
            }
        }
        
        return output;
    }

    floatTo16BitPCM(float32Array) {
        const buffer = new ArrayBuffer(float32Array.length * 2);
        const view = new DataView(buffer);
        
        for (let i = 0; i < float32Array.length; i++) {
            const s = Math.max(-1, Math.min(1, float32Array[i]));
            view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
        
        return Buffer.from(buffer);
    }

    stop() {
        this.isRecording = false;
        
        if (this.scriptProcessor) {
            this.scriptProcessor.disconnect();
            this.scriptProcessor = null;
        }
        
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        
        console.log('[AudioCapture] 已停止采集');
    }
}