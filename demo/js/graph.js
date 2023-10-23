const SMOOTHING = 0.8;
const FFT_SIZE = 512;


var Graph = function( canvas, analyser ) {
    this.canvas = canvas;
    this.ctx = this.canvas.getContext('2d');
    this.freqs = new Uint8Array( FFT_SIZE/2 );
    this.times = new Uint8Array( FFT_SIZE/2 );

    this.setAnalyser( analyser );

    // webkit prefix for chrome < 24
    if ( window.requestAnimationFrame === undefined ) {
        window.requestAnimationFrame = window.webkitRequestAnimationFrame;
    }
    window.requestAnimationFrame(this.draw.bind(this));
};


Graph.prototype.setAnalyser = function( analyser ) {
    this.analyser = analyser;
    this.analyser.minDecibels = -122;
    this.analyser.maxDecibels = 0;
    this.analyser.smoothingTimeConstant = SMOOTHING;
    this.analyser.fftSize = FFT_SIZE;
};


Graph.prototype.draw = function() {
    // Get the frequency data from the stream
    this.analyser.getByteFrequencyData(this.freqs);
    this.analyser.getByteTimeDomainData(this.times);

    // Clear the current content of the canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // We increase artificially the bar width (times 1.3) to give more space
    // to visible bars (the last bars are always very close to 0)
    this.barWidth = this.canvas.width*1.3 / ( FFT_SIZE / 2 );

    // Draw the frequency domain chart
    for ( var i = 0; i < this.analyser.frequencyBinCount; i++ ) {
        var value = this.freqs[i];
        var percent = value / 256;
        var height = this.canvas.height * percent;
        var offset = ( this.canvas.height - height );
        var hue = i/this.analyser.frequencyBinCount * 360;
        this.ctx.fillStyle = 'hsl(' + hue + ', 100%, 50%)';
        this.ctx.fillRect(i * this.barWidth, offset, this.barWidth, height);
    }

    // Draw the time domain chart
    this.ctx.fillStyle = 'black';
    for ( var i = 0; i < this.analyser.frequencyBinCount; i++ ) {
        var value = this.times[i];
        var percent = value / 256;
        var height = this.canvas.height * percent;
        var offset = this.canvas.height - height - 1;
        this.ctx.fillRect(i * this.barWidth, offset, this.barWidth, 4);
    }

    // Ask the browser to callback this function at its next refresh
    window.requestAnimationFrame(this.draw.bind(this));
}

