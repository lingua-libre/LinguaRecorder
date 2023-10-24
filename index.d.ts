declare interface AudioRecord {
	samples: Float32Array;
	sampleRate: number;

	constructor(samples: Float32Array, sampleRate: number);

	setSampleRate(value: number): void;
	getSampleRate(): number;
	getLength(): number;
	getDuration(): number;
	getSamples(): Float32Array;
	lTrim(duration?: number): void;
	rTrim(duration?: number): void;
	clear(): void;
	play(): void;
	getBlob(): Blob;
	getWAVE(): Blob;
	getObjectURL(): string;
	download(fileName?: string): void;
	getAudioElement(): HTMLAudioElement;

	writeString(dataview: DataView, offset: number, str: string): void;
}


declare interface RecordProcessorConfig {
	autoStart?: boolean;
	autoStop?: boolean;
	bufferSize?: 0 | 256 | 512 | 1024 | 2048 | 4096 | 8192 | 16384;
	timeLimit?: number;
	onSaturate?: 'none' | 'cancel' | 'discard';
	saturationThreshold?: number;
	startThreshold?: number;
	stopThreshold?: number;
	stopDuration?: number;
	marginBefore?: number;
	marginAfter?: number;
	minDuration?: number;
}

declare enum STATE {
	"recording",
	"listening",
	"paused",
	"stop",
}

declare enum EVENT {
    "ready",
    "readyFail",
    "started",
    "listening",
    "recording",
    "saturated",
    "paused",
    "stopped",
    "canceled"
}

declare interface LinguaRecorder {
	new(recordProcessorConfig?: RecordProcessorConfig): LinguaRecorderClass;
}

declare interface LinguaRecorderClass {
	stream: MediaStream | null;
	audioContext: AudioContext | null;
	audioInput: MediaStreamAudioSourceNode | null;
	processor: AudioWorkletNode | null;
	recordProcessorConfig: RecordProcessorConfig;
	_isConnected: boolean;
	_extraAudioNodes: AudioNode[];
	_eventHandlers: { [key in EVENT]?: ((value?: any) => void)[] };
	_eventStorage: { [key in "ready" | "readyFail"]?: any };
	_state: STATE;
	_duration: number;

	constructor(recordProcessorConfig?: RecordProcessorConfig);

    setConfig(config: object): LinguaRecorderClass;
    getRecordingTime(): number;
    getState(): STATE;
    getAudioContext(): AudioContext | null;
	start(): LinguaRecorderClass;
	pause(): LinguaRecorderClass;
	stop(): LinguaRecorderClass;
	cancel(): LinguaRecorderClass;
    toggle(): LinguaRecorderClass;
	resume(): LinguaRecorderClass;
    on(event: string, handler: (value?: any) => void): LinguaRecorderClass;
	off(event: string, handler?: (value?: any) => void): LinguaRecorderClass;
	connectAudioNode(node: AudioNode): LinguaRecorderClass;
    disconnectAudioNode(node: AudioNode): LinguaRecorderClass;
    close(): LinguaRecorderClass | undefined;

	_sendCommandToProcessor(command: string, extra?: any): LinguaRecorderClass;
	_fire(event: string, value?: any): void;
	_getAudioStream(): Promise<void>;
	_initStream(): Promise<void>;
	_connect(): void;
	_disconnect(): void;
}
