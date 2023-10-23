'use strict';

/**
 * Some MIME-type analyzer are just checking if the UTF-8 decoded file
 * contains the strings "<?php" or "<\x00?\x00". So by banning 4 samples
 * ("?\x00" ; "\x00?" ; "ph" ; "hp"), we get rid of all problems
 * see https://phabricator.wikimedia.org/T212584
 */
const BANNED_SAMPLES = [ 0x003F, 0x3F00, 0x6870, 0x7068 ];


/**
 * @class AudioRecord
 * Represents an audio recording and provides a handset of helper functions
 * to exploit it in different contexts.
 */
class AudioRecord {

	/**
	 * Creates a new AudioRecord instance.
	 * 
	 * @param {Float32Array} [samples] The raw samples that will make up the record
	 * @param {Number} [sampleRate] Rate at which the samples added to this object should be played
	 */
	constructor( samples, sampleRate ) {
		this.sampleRate = sampleRate;
		this.samples = samples;
	}


	/**
	 * Change the sample rate.
	 *
	 * @param {Number} [value] new sample rate to set.
	 */
	setSampleRate( value ) {
		this.sampleRate = value;
	}


	/**
	 * Get the sample rate in use.
	 *
	 * @return {Number} Current sample rate for the record.
	 */
	getSampleRate() {
		return this.sampleRate;
	}


	/**
	 * Get the total number of samples in the record.
	 *
	 * @return {Number} Number of samples.
	 */
	getLength() {
		return this.samples.length;
	}


	/**
	 * Get the duration of the record.
	 *
	 * This is based on the number of samples and the declared sample rate.
	 *
	 * @return {Number} Duration (in seconds) of the record.
	 */
	getDuration() {
		return this.samples.length / this.sampleRate;
	}


	/**
	 * Get all the raw samples that make up the record.
	 *
	 * @return {Float32Array} List of all samples.
	 */
	getSamples() {
		return this.samples;
	}


	/**
	 * Trim the record, starting with the beginning of the record (the left side).
	 *
	 * @param {Number} [duration] duration (in seconds) to trim.
	 */
	lTrim( duration ) {
		var nbSamplesToRemove = Math.round( duration * this.sampleRate );

		if ( nbSamplesToRemove >= this.samples.length ) {
			this.clear();
			return;
		}

		this.samples = this.samples.subarray( nbSamplesToRemove );
	}


	/**
	 * Trim the record, starting with the end of the record (the right side).
	 *
	 * @param {Number} [duration] duration (in seconds) to trim.
	 */
	rTrim( duration ) {
		var nbSamplesToRemove = Math.round( duration * this.sampleRate );

		if ( nbSamplesToRemove >= this.samples.length ) {
			this.clear();
			return;
		}

		this.samples = this.samples.subarray( 0, this.samples.length - nbSamplesToRemove );
	}


	/**
	 * Clear the record.
	 */
	clear() {
		this.samples = new Float32Array( 0 );
	}


	/**
	 * Play the record to the audio output (aka the user's loudspeaker).
	 */
	play() {
		var audioContext = new window.AudioContext();

		var buffer = audioContext.createBuffer( 1, this.samples.length, 48000 );  // sample rate
		var channelData = buffer.getChannelData( 0 );
		for ( let i = 0; i < this.samples.length; i++ ) {
			channelData[i] = this.samples[ i ];
		}

		var source = audioContext.createBufferSource();
		source.buffer = buffer;
		source.connect( audioContext.destination );

		source.start(0);
	}


	/**
	 * Get a WAV-encoded Blob version of the record.
	 *
	 * @return {Blob} WAV-encoded audio record.
	 * @alias getWAVE()
	 */
	getBlob() {
		var buffer = new ArrayBuffer(44 + this.samples.length * 2),
			view = new DataView(buffer);

		/* RIFF identifier */
		AudioRecord.writeString(view, 0, 'RIFF');
		/* file length */
		view.setUint32(4, 32 + this.samples.length * 2, true);
		/* RIFF type */
		AudioRecord.writeString(view, 8, 'WAVE');
		/* format chunk identifier */
		AudioRecord.writeString(view, 12, 'fmt ');
		/* format chunk length */
		view.setUint32(16, 16, true);
		/* sample format (raw) */
		view.setUint16(20, 1, true);
		/* channel count */
		view.setUint16(22, 1, true);
		/* sample rate */
		view.setUint32(24, this.sampleRate, true);
		/* byte rate (sample rate * block align) */
		view.setUint32(28, this.sampleRate * 2, true);
		/* block align (channel count * bytes per sample) */
		view.setUint16(32, 2, true);
		/* bits per sample */
		view.setUint16(34, 16, true);
		/* data chunk identifier */
		AudioRecord.writeString(view, 36, 'data');
		/* data chunk length */
		view.setUint32(40, this.samples.length * 2, true);

		for ( let i = 0; i < this.samples.length; i++ ){
			/* Turn a 0->1 amplitude to 0->0x7FFF (highest number possible in a signed 16bits integer) */
			let sample = parseInt( this.samples[i] * 0x7FFF );
			/* Get rid of banned samples by incrementing it */
			if ( BANNED_SAMPLES.indexOf( sample ) > -1 ) {
				sample++;
			}
			/* Append the sample in the data chunk */
			view.setInt16( 44 + i * 2, sample, true );
		}

		return new Blob( [view], {"type": "audio/wav"} );
	}


	/**
	 * @alias getBlob()
	 */
	getWAVE() {
		return this.getBlob();
	}


	/**
	 * Generate an object URL representing the WAV-encoded record.
	 *
	 * For performance reasons, you should unload the objectURL once you're
	 * done with it, see
	 * https://developer.mozilla.org/en-US/docs/Web/API/URL/revokeObjectURL
	 *
	 * @return {DOMString} URL representing the record.
	 */
	getObjectURL() {
		return window.URL.createObjectURL( this.getBlob() );
	}


	/**
	 * Start the download process of the record as if it where a normal file.
	 *
	 * @param {String} [fileName='record.wav'] name of the file that will be downloaded.
	 */
	download( fileName ) {
		var a = document.createElement( 'a' ),
			url = this.getObjectURL();

		fileName = fileName || 'record.wav';
		if ( fileName.toLowerCase().indexOf( '.wav', fileName.length - 4 ) === -1 ) {
			fileName += '.wav';
		}

		a.style.display = "none";
		a.href = url;
		a.download = fileName;

		document.body.appendChild( a );
		a.click();

		// It seems that old browser take time to take into account the click
		// So we delay the deletion of the URL to let them enough time to start the download
		setTimeout( function() {
			document.body.removeChild( a );
			window.URL.revokeObjectURL( url );
		}, 1000 );
	}


	/**
	 * Generate an HTML5 <audio> element containing the WAV-encoded record.
	 *
	 * @return {HTMLElement} audio element containing the record.
	 */
	getAudioElement() {
		var audio = document.createElement( 'audio' ),
			source = document.createElement( 'source' );

		source.src = this.getObjectURL();
		source.type = 'audio/wav';
		audio.appendChild( source );
		return audio;
	}


	/**
	 * Internal static helper function used in getBlob to write a complete string at once
	 * in a DataView object.
	 *
	 * @static
	 * @param {DataView} [dataview] DataView in which to write.
	 * @param {Number} [offset] Offset at which writing should start.
	 * @param {String} [str] String to write in the DataView.
	 * @private
	 */
	static writeString( dataview, offset, str ) {
		for ( let i = 0; i < str.length; i++ ){
			dataview.setUint8( offset + i, str.charCodeAt( i ) );
		}
	}
}




