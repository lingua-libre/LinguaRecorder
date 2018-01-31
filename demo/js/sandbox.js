'use strict';

var recorder = null,
    graph = null;


function initRecorder() {
    recorder = new LinguaRecorder( {
        autoStart: $("#autoStart").is(':checked'),
        autoStop: $("#autoStop").is(':checked'),
        bufferSize: parseInt($("#bufferSize").val()),
        timeLimit: parseFloat($("#timeLimit").val()),
        onSaturate: $("#onSaturate").val(),
        saturationThreshold: parseFloat($("#saturationThreshold").val()),
        startThreshold: parseFloat($("#startThreshold").val()),
        stopThreshold: parseFloat($("#stopThreshold").val()),
        stopDuration: parseFloat($("#stopDuration").val()),
        marginBefore: parseFloat($("#marginBefore").val()),
        marginAfter: parseFloat($("#marginAfter").val()),
        minDuration: parseFloat($("#minDuration").val()),
    } );

    recorder.on( 'ready', function() {
        /* Setup the graph with an analyser binded to our new recorder */
        var analyser = recorder.getAudioContext().createAnalyser();
        recorder.connectAudioNode( analyser );
        if ( graph === null ) {
            graph = new Graph( $( '#canvas' )[0], analyser );
        }
        else {
            graph.setAnalyser( analyser );
        }
        incrementEvent( '#ready' );
    } ).on( 'readyFail', function() {
        incrementEvent( '#readyfail' );
    } ).on( 'started', function() {
        incrementEvent( '#started' );
    } ).on( 'recording', function() {
        incrementEvent( '#recording' );
    } ).on( 'listening', function() {
        incrementEvent( '#listening' );
    } ).on( 'saturated', function() {
        incrementEvent( '#saturated' );
    } ).on( 'paused', function() {
        incrementEvent( '#paused' );
    } ).on( 'stoped', function( audioRecord ) {
        addSound( audioRecord );
        incrementEvent( '#stoped' );
    } ).on( 'canceled', function() {
        incrementEvent( '#canceled' );
    } );

}


/* Some helper functions */
function incrementEvent( selector ) {
  var value = parseInt( $( selector ).text() );
  $( selector ).text( value + 1 );
};


function addSound( audioRecord ) {
    /* Generate a nice view */
    var item = $( '<div class="item">' ),
        soundIcon = $( '<i class="sound icon">' ),
        content = $( '<div class="content">' ),
        header = $( '<div class="header">' ),
        playLink = $( '<a href="#">' ),
        playIcon = $( '<i class="volume up icon">' ),
        audioLink = $( '<a href="#">' ),
        audioIcon = $( '<i class="volume up icon">' ),
        downloadLink = $( '<a href="#">' ),
        downloadIcon = $( '<i class="download icon">' );

    playLink.text( 'play' ).prepend( playIcon );
    audioLink.text( 'audio' ).prepend( audioIcon );
    downloadLink.text( 'download' ).prepend( downloadIcon );
    content.append( header ).append( playLink ).append( audioLink ).append( downloadLink );
    item.append( soundIcon ).append( content );
    $( '#sounds' ).append( item );

    /* Complete with informations from the new AudioRecord */
    var duration = Math.round( audioRecord.getDuration() * 1000 ) / 1000;
    header.text( duration + ' seconds' );
    playLink.click( function( e ) {
        e.preventDefault();
        audioRecord.play();
    } );
    audioLink.click( function( e ) {
        e.preventDefault();
        audioRecord.getAudioElement().play();
    } );
    downloadLink.click( function( e ) {
        e.preventDefault();
        audioRecord.download();
        console.log( audioRecord.getBlob() );
    } );

};



$( function() {

    /* Init the recorder a first time at startup */
    initRecorder();
    /* But re-init it when the refresh button is clicked */
    $( '#refresh' ).click( function() {
        recorder.stop();
        initRecorder();
    } );


    /* Bind events to the buttons to start/pause/stop when asked by the user */
    $( '#start' ).click( function() {
        recorder.start();
    } );

    $( '#pause' ).click( function() {
        recorder.pause();
    } );

    $( '#stop' ).click( function() {
        recorder.stop();
    } );

} );
