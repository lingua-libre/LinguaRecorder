'use strict';

/*
 TODO
 - Bouton d'enregistrement gris quand not ready
 - Documenter
 - Propriser
 - Dégager les constantes WIDTH et HEIGHT
*/

var WIDTH = 400;
var HEIGHT = 150;

var SMOOTHING = 0.8;
var FFT_SIZE = 512;


var Studio = function( config ) {
	// Configuration initialization
	config = config || {};

    this.$element = config.$element;

    this.recorder = new Recorder( config.recorder );

    this.isRecording = false;
    this.isReady = false;
    console.log( this.$element.find( '.studio-canvas' ) );
    this.canvas = this.$element.find( '.studio-canvas' )[0];
    this.ctx = this.canvas.getContext('2d');
    this.canvasWidth = this.canvas.width;
    this.canvasHeight = this.canvas.height;
    this.barWidth = this.canvasWidth / ( FFT_SIZE / 2 );
    this.freqs = new Uint8Array( FFT_SIZE/2 );
    this.times = new Uint8Array( FFT_SIZE/2 );

    var studio = this;
    this.recorder.on( 'ready', this.onReady.bind( this ) );
    this.recorder.on( 'started', this.onStart.bind( this ) );
    this.recorder.on( 'recording', this.onRecord.bind( this ) );
    this.recorder.on( 'stoped', this.onStop.bind( this ) );
    this.recorder.on( 'canceled', this.onCancel.bind( this ) );
    this.recorder.on( 'saturated', this.onSaturate.bind( this ) );

};

Studio.prototype.onReady = function() {
    this.analyser = this.recorder.getAudioContext().createAnalyser();
    this.analyser.minDecibels = -122;
    this.analyser.maxDecibels = 0;
    this.analyser.smoothingTimeConstant = SMOOTHING;
    this.analyser.fftSize = FFT_SIZE;

    this.recorder.connectAudioNode( this.analyser );

    this.$element.find( '.studio-rbutton-inner' ).click( this.onRecordingButtonClick.bind( this ) );

    this.$element.find( '.studio-head' ).addClass( 'studio-ready' );

    requestAnimationFrame(this.draw.bind(this));
};

Studio.prototype.onStart = function() {
    this.isRecording = true;
};

Studio.prototype.onRecord = function() {
    return;
};

Studio.prototype.onStop = function() {
    this.isRecording = false;
};

Studio.prototype.onCancel = function() {
    this.isRecording = false;
};

Studio.prototype.onSaturate = function() {
    return;
};

Studio.prototype.onRecordingButtonClick = function() {
    if ( this.isRecording ) {
        this.$element.find( '.studio-head' ).removeClass( 'studio-rec' );
        this.recorder.stop();
    }
    else {
        this.recorder.start();
        this.$element.find( '.studio-head' ).addClass( 'studio-rec' );
    }
};


Studio.prototype.draw = function() {
    // Get the frequency data from the stream
    this.analyser.getByteFrequencyData(this.freqs);
    this.analyser.getByteTimeDomainData(this.times);

    // Clear the current content of the canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw the frequency domain chart
    for ( var i = 0; i < this.analyser.frequencyBinCount; i=i+2 ) {
        var value = ( this.freqs[i] + this.freqs[i+1] ) / 2;
        var percent = value / 256;
        var height = HEIGHT * percent;
        var offset = ( HEIGHT - height ) / 2;
        var hue = i/this.analyser.frequencyBinCount * 360;
        this.ctx.fillStyle = 'hsl(' + hue + ', 100%, 50%)';
        this.ctx.fillRect(i/2 * this.barWidth, offset, this.barWidth, height);
        this.ctx.fillRect(WIDTH - (i/2 * this.barWidth), offset, this.barWidth, height);
    }

    // Draw the time domain chart
    this.ctx.fillStyle = ( this.recorder._isSaturated ? 'red' : 'black' );
    for ( var i = 0; i < this.analyser.frequencyBinCount; i++ ) {
        var value = this.times[i];
        var percent = value / 256;
        var height = HEIGHT * percent;
        var offset = HEIGHT - height - 1;
        this.ctx.fillRect(i * this.barWidth, offset, 1, 4);
    }

    // Ask the browser to callback this function at its next refresh
    requestAnimationFrame(this.draw.bind(this));
}





var ManualStudio = function( config ) {
	config = config || {};
    Studio.call( this, config );
};
$.extend( ManualStudio.prototype, Studio.prototype )





var SingleWordStudio = function( config ) {
	config = config || {};
	config.recorder = { 'autoStart': true, 'autoStop': true };
    Studio.call( this, config );
};
$.extend( SingleWordStudio.prototype, Studio.prototype )







