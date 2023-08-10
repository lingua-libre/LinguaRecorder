'use strict';

/**
 * code from AudioRecord.js here because of the Worklet isolation.
 * TODO: integrate this into the AudioWorklet
 */
var AudioRecord = function( sampleRate ) {
	this.sampleRate = sampleRate;
	this.sampleBlocs = [];
	this.length = 0;
};

AudioRecord.prototype.push = function( samples, rollingDuration ) {
	this.length += samples.length;
	this.sampleBlocs.push( samples );

	if ( rollingDuration !== undefined ) {
		var duration = this.getDuration();
		if ( duration > rollingDuration ) {
			this.ltrim( duration - rollingDuration );
		}
	}

	return this.length;
};

AudioRecord.prototype.getDuration = function() {
	return this.length / this.sampleRate;
};

AudioRecord.prototype.getSamples = function() {
	var flattened = new Float32Array( this.length ),
		nbBlocs = this.sampleBlocs.length,
		offset = 0;

	for ( var i = 0; i < nbBlocs; ++i ) {
		flattened.set( this.sampleBlocs[ i ], offset );
		offset += this.sampleBlocs[ i ].length
	}

	return flattened;
};

AudioRecord.prototype.ltrim = function( duration ) {
	var nbSamplesToRemove = Math.round( duration * this.sampleRate );

	if ( nbSamplesToRemove >= this.length ) {
		this.sampleBlocs = [];
		return;
	}

	this.length -= nbSamplesToRemove;
	while ( nbSamplesToRemove > 0 && nbSamplesToRemove >= this.sampleBlocs[ 0 ].length ) {
		nbSamplesToRemove -= this.sampleBlocs[ 0 ].length;
		this.sampleBlocs.shift();
	}
	if ( nbSamplesToRemove > 0 ) {
		this.sampleBlocs[ 0 ] = this.sampleBlocs[ 0 ].subarray( 0, this.sampleBlocs[ 0 ].length - nbSamplesToRemove );
	}
};

AudioRecord.prototype.rtrim = function( duration ) {
	var nbSamplesToRemove = Math.round( duration * this.sampleRate );

	if ( nbSamplesToRemove >= this.length ) {
		this.sampleBlocs = [];
		return;
	}

	this.length -= nbSamplesToRemove;
	while ( nbSamplesToRemove > 0 && nbSamplesToRemove >= this.sampleBlocs[ this.sampleBlocs.length - 1 ].length ) {
		nbSamplesToRemove -= this.sampleBlocs[ this.sampleBlocs.length - 1 ].length;
		this.sampleBlocs.pop();
	}
	if ( nbSamplesToRemove > 0 ) {
		var lastIndex = this.sampleBlocs.length - 1;
		this.sampleBlocs[ lastIndex ] = this.sampleBlocs[ lastIndex ].subarray( nbSamplesToRemove );
	}
};




var STATE = {
	stop: 'stop',
	listening: 'listen',
	recording: 'record',
	paused: 'pause',
}

class RecordingProcessor extends AudioWorkletProcessor {
	constructor(options) {
		super();
		
		this.autoStart = options.processorOptions.autoStart === true;
		this.autoStop = options.processorOptions.autoStop === true;
		this.timeLimit = options.processorOptions.timeLimit || 0;
		this.cancelOnSaturate = options.processorOptions.onSaturate === 'cancel';
		this.discardOnSaturate = options.processorOptions.onSaturate === 'discard';
		this.saturationThreshold = options.processorOptions.saturationThreshold || 0.99;

		this.startThreshold = options.processorOptions.startThreshold === undefined ? 0.1 : options.processorOptions.startThreshold;
		this.stopThreshold = options.processorOptions.stopThreshold === undefined ? 0.05 : options.processorOptions.stopThreshold;
		this.stopDuration = options.processorOptions.stopDuration === undefined ? 0.3 : options.processorOptions.stopDuration;
		this.marginBefore = options.processorOptions.marginBefore === undefined ? 0.25 : options.processorOptions.marginBefore;
		this.marginAfter = options.processorOptions.marginAfter === undefined ? 0.25 : options.processorOptions.marginAfter;
		this.minDuration = options.processorOptions.minDuration === undefined ? 0.15 : options.processorOptions.minDuration;
		
		
		this.sampleRate = options.processorOptions.sampleRate;

		this._state = STATE.stop;
		this._audioRecord = null;
		this._silenceSamplesCount = 0;
		this._isSaturated = false;

		this.port.onmessage = (event) => {
			console.log("RP:", event.data.message)
			switch (event.data.message) {
				case 'start':
					this._start();
					break;
				
				case 'pause':
					this._pause();
					break;
				
				case 'stop':
					this._stop();
					break;
				
				case 'cancel':
					this._stop( true );
					break;
				
				case 'toggle':
					if ( this._state === STATE.recording || this._state === STATE.listening ) {
						this.stop();
					}
					else {
						this.start();
					}
					break;
			}
		};
	}
	
	_start() {
		if ( this._state === STATE.listening || this._state === STATE.recording ) {
			return false;
		}

		if ( this._state === STATE.stop ) {
			this._audioRecord = new AudioRecord( this.sampleRate );
			this._silenceSamplesCount = 0;
			this._isSaturated = false;

			if ( this.autoStart ) {
				this._state = STATE.listening;
				return true;
			}
		}

		this._state = STATE.recording;
		this.port.postMessage({ message: 'started' });

		return true;
	}
	
	_pause() {
		if ( this._state === STATE.stop || this._state === STATE.paused ) {
			return false;
		}

		if ( this._state === STATE.listening ) {
			this._state = STATE.stop;
		}
		else {
			this._state = STATE.paused;
		}

		this.port.postMessage({ message: 'paused' });
		return true;
	}
	
	_stop( cancelRecord ) {
		var cancelRecord = false || cancelRecord;

		if ( this._state === STATE.stop ) {
			return false;
		}

		if ( cancelRecord === true ) {
			this._audioRecord = null;
			this.port.postMessage({ message: 'canceled', reason: 'asked' });
		}
		else if ( ( this.discardOnSaturate || this.cancelOnSaturate ) && this._isSaturated ) {
			this._audioRecord = null;
			this.port.postMessage({ message: 'canceled', reason: 'saturated' });
		}
		else if ( this._audioRecord.getDuration() < this.minDuration ) {
			this._audioRecord = null;
			this.port.postMessage({ message: 'canceled', reason: 'tooShort' });
		}
		else {
			this.port.postMessage({ message: 'stoped', record: this._audioRecord.getSamples() });
		}
		
		this._state = STATE.stop

		return true;
	}

	process(inputs, outputs, params) {
		if ( this._state === STATE.listening ) {
			this._audioListeningProcess( inputs, outputs, params );
		}
		else if ( this._state === STATE.recording ) {
			this._audioRecordingProcess( inputs, outputs, params );
		}
		
		// Pass data directly to output, unchanged.  TODO: needed?
		for ( var sample=0; sample < inputs[0][0].length; sample++ ) {
			outputs[0][0][sample] = inputs[0][0][sample];
		}
		
		return true; //needed to keep the processor alive
	}
	
	/**
	 * Event handler for the listening ScriptProcessorNode.
	 *
	 * Check whether it can auto-start recording, or store
	 * the last marginBefore seconds incomming from the microphone.
	 *
	 * @private
	 */
	_audioListeningProcess( inputs, outputs, params ) {
		// Get the samples from the input buffer
		var samples = new Float32Array( inputs[0][0] ); // Copy the samples in a new Float32Array, to avoid memory dealocation

		// Analyse the sound to autoStart when it should
		for ( var i=0; i < samples.length; i++ ) {
			var amplitude = Math.abs( samples[ i ] );
			if ( amplitude > this.startThreshold ) {
				// start the record
				this._state = STATE.recording;
				this.port.postMessage({ message: 'started' });
				return this._audioRecordingProcess( inputs, outputs, params );
			}
		}

		// Store the sound in the AudioRecord object
		if ( this.marginBefore > 0 ) {
			this._audioRecord.push( samples, this.marginBefore );
		}
		this.port.postMessage({ message: 'listening', samples: samples });
	}


	/**
	 * Event handler for the recording ScriptProcessorNode.
	 *
	 * In charge of saving the incomming audio stream from the user's microphone
	 * into the rawAudioBuffer.
	 *
	 * Check also if the incomming sound is not saturated, if the timeLimit
	 * is not reached, and if the record should auto-stop.
	 *
	 * @private
	 */
	_audioRecordingProcess( inputs, outputs, params ) {
		// Get the samples from the input buffer
		var samples = new Float32Array( inputs[0][0] ); // Copy the samples in a new Float32Array, to avoid memory dealocation

		// Store the sound in the AudioRecord object
		this._audioRecord.push( samples );
		this.port.postMessage({ message: 'recording', samples: samples });

		// Check if the samples are not saturated
		for ( var i=0; i < samples.length; i++ ) {
			var amplitude = Math.abs( samples[ i ] );
			if ( amplitude > this.saturationThreshold ) {
				this.port.postMessage({ message: 'saturated' });
				this._isSaturated = true;
				if ( this.cancelOnSaturate ) {
					this._stop();
					return;
				}
				break;
			}
		}

		// Analyse the sound to autoStop if needed
		if ( this.autoStop ) {
			var amplitudeMax = 0;
			for ( var i=0; i < samples.length; i++ ) {
				var amplitude = Math.abs( samples[ i ] );
				if ( amplitude > amplitudeMax ) {
					amplitudeMax = amplitude;
				}
			}

			if ( amplitudeMax < this.stopThreshold ) {
				this._silenceSamplesCount += samples.length;

				if ( this._silenceSamplesCount >= ( this.stopDuration * this.sampleRate ) ) {
					this._audioRecord.rtrim( this.stopDuration - this.marginAfter );
					this._stop();
				}
			}
			else {
				this._silenceSamplesCount = 0;
			}
		}

		// If one is set, check if we have not reached the time limit
		if ( this.timeLimit > 0 ) {
			if ( this.timeLimit >= this._audioRecord.getDuration() ) {
				this._stop();
			}
		}
	}
}

registerProcessor('recording-processor', RecordingProcessor);

