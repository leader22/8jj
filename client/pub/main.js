(function(global) {
'use strict';

var SOCKET_SERVER = global.SOCKET_SERVER;
var BUFFER_SIZE   = global.BUFFER_SIZE;

var io  = global.io;
var Vue = global.Vue;
var gUM = navigator.getUserMedia.bind(navigator);
var AudioContext = global.AudioContext;

function _err(err) { console.error(err); }


var pubApp = {
  el: '#jsPubApp',
  data: {
    _socket: null,
    _stream: null,
    _ctx:    null,
    _audio:  {
      source:    null,
      processor: null,
      filter:    null,
      analyser:  null,
      gain:      null
    },
    state: {
      isMicOn: false,
      isPub:   false
    },
    subNum: 0
  },
  events: {
    'hook:created':  function() { this._hookCreated(); },
    'hook:attached': function() { this._hookAttached(); }
  },
  methods: {
    onMic: function() {
      var that = this;
      if (that.state.isMicOn) { return; }

      gUM({ audio: true }, this._onMicStream, _err);
    },

    offMic:  function() {
      if (!this.state.isMicOn) { return; }

      this.$data._stream.getTracks().forEach(function(t) { t.stop(); });
      this.$data._stream = null;
      this.state.isMicOn = false;

      var audio = this.$data._audio;
      Object.keys(audio).forEach(function(key) {
        audio[key] && audio[key].disconnect();
        audio[key] = null;
      }, this);

      cancelAnimationFrame(this._drawInputSpectrum);
      this.stopPub();
    },

    startPub: function() {
      if (!this.state.isMicOn) { return; }
      if (this.state.isPub) { return; }

      this.state.isPub = true;
    },

    stopPub: function() {
      if (!this.state.isPub) { return; }

      this.state.isPub = false;
    },

    _onMicStream: function(stream) {
      this.$data._stream = stream;
      this.state.isMicOn = true;

      var ctx = this.$data._ctx;
      var audio = this.$data._audio;

      // マイク
      audio.source = ctx.createMediaStreamSource(this.$data._stream);

      // ないよりマシなフィルター
      audio.filter = ctx.createBiquadFilter();
      audio.filter.type = 'highshelf';

      // マイクレベル確認用
      audio.analyser = ctx.createAnalyser();
      audio.analyser.smoothingTimeConstant = 0.4;
      audio.analyser.fftSize = BUFFER_SIZE;

      // 音質には期待しないのでモノラルで飛ばす
      audio.processor = ctx.createScriptProcessor(BUFFER_SIZE, 1, 1);
      audio.processor.onaudioprocess = this._onAudioProcess;

      // 自分のフィードバックいらない
      audio.gain = ctx.createGain();
      audio.gain.gain.value = 0;

      audio.source.connect(audio.filter);
      audio.filter.connect(audio.analyser);
      audio.source.connect(audio.processor);
      audio.processor.connect(audio.gain);
      audio.gain.connect(ctx.destination);

      this._drawInputSpectrum();
    },

    _onAudioProcess: function(ev) {
      var inputBuffer  = ev.inputBuffer;
      var outputBuffer = ev.outputBuffer;
      var inputData  = inputBuffer.getChannelData(0);
      var outputData = outputBuffer.getChannelData(0);

      // Bypassしつつ飛ばす
      outputData.set(inputData);
      if (this.state.isPub) {
        this.$data._socket.emit('audio', outputData.buffer);
      }
    },

    _drawInputSpectrum: function() {
      if (!this.$data._audio.analyser) { return; }

      var analyser = this.$data._audio.analyser;
      var fbc = analyser.frequencyBinCount;
      var freqs = new Uint8Array(fbc);
      analyser.getByteFrequencyData(freqs);

      var $canvas = this.$els.canvas;
      var drawContext = $canvas.getContext('2d');

      drawContext.clearRect(0, 0, $canvas.width, $canvas.height);
      for (var i = 0; i < freqs.length; i++) {
        var barWidth = $canvas.width / fbc;
        // 0 - 255の値が返るのでそれを使って描画するバーの高さを得る
        var height = $canvas.height * (freqs[i] / 255);
        var offset = $canvas.height - height;
        drawContext.fillStyle = 'hsl(' + (i / fbc * 360) + ', 100%, 50%)';
        drawContext.fillRect(i * barWidth, offset, barWidth + 1, height);
      }
      requestAnimationFrame(this._drawInputSpectrum);
    },

    _hookCreated: function() {
      var $data = this.$data;

      $data._ctx = new AudioContext();
      $data._socket = io(SOCKET_SERVER);
      $data._socket.on('subNum', function(num) {
        $data.subNum = num;
      });
    },

    _hookAttached: function() {
      var $canvas = this.$els.canvas;
      $canvas.width  = window.innerWidth * 2;
      $canvas.height = $canvas.width / 10;
      $canvas.style.width  = '100%';
      $canvas.style.height = '10%';
    }
  }
};

new Vue(pubApp);

}(this));
