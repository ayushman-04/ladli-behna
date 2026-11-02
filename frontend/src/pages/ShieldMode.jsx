import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEmergency, useToast } from '../App'

const API_BASE = 'http://localhost:8000'
const WS_BASE = API_BASE.replace(/^http/, 'ws')

export default function ShieldMode() {
  const navigate = useNavigate()
  const { triggerEmergency } = useEmergency()
  const { showToast } = useToast()

  const [active, setActive] = useState(false)
  const [threatLevel, setThreatLevel] = useState('SAFE')
  const [analysisLog, setAnalysisLog] = useState([])
  const [currentTranscript, setCurrentTranscript] = useState('')
  const [listening, setListening] = useState(false)
  const [wsStatus, setWsStatus] = useState('disconnected')
  const [alarm, setAlarm] = useState(null)
  const [sosResult, setSosResult] = useState(null)
  const [sessionStats, setSessionStats] = useState({
    sessionId: null,
    chunks: 0,
    bytes: 0,
    lastLocationAt: null,
    state: 'LISTENING',
    score: 0,
    transcripts: 0,
  })

  // --- Upload / Record state ---
  const [recording, setRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [uploadingAudio, setUploadingAudio] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const [recordedBlob, setRecordedBlob] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)

  const canvasRef = useRef(null)
  const animationRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const recognitionRef = useRef(null)
  const websocketRef = useRef(null)
  const locationIntervalRef = useRef(null)
  const pingIntervalRef = useRef(null)
  const activeRef = useRef(false)

  const sendWsJson = useCallback((payload) => {
    const ws = websocketRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    ws.send(JSON.stringify(payload))
    return true
  }, [])

  const getCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) return

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        sendWsJson({
          type: 'location',
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        })
      },
      () => {},
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 3000 }
    )
  }, [sendWsJson])

  const addLogEntry = useCallback((entry) => {
    setAnalysisLog(prev => [
      {
        timestamp: new Date().toLocaleTimeString(),
        level: 'SAFE',
        transcript: '',
        ...entry,
      },
      ...prev.slice(0, 19),
    ])
  }, [])

  const connectRealtimeSession = useCallback(() => {
    const token = localStorage.getItem('shieldher_token')
    if (!token) {
      showToast('Please login again to start Shield Mode', 'error')
      return null
    }

    const ws = new WebSocket(`${WS_BASE}/api/ws/audio?token=${encodeURIComponent(token)}`)
    websocketRef.current = ws
    setWsStatus('connecting')

    ws.onopen = () => {
      setWsStatus('connected')
      showToast('Realtime monitoring connected', 'success')
      getCurrentLocation()
      locationIntervalRef.current = setInterval(getCurrentLocation, 5000)
      pingIntervalRef.current = setInterval(() => sendWsJson({ type: 'ping' }), 15000)
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)

        if (message.type === 'session_started') {
          setSessionStats(prev => ({
            ...prev,
            sessionId: message.session?.session_id || null,
          }))
          addLogEntry({ reason: 'Realtime session started' })
        }

        if (message.type === 'audio_ack') {
          setSessionStats(prev => ({
            ...prev,
            sessionId: message.session_id || prev.sessionId,
            chunks: message.audio_chunks_received || prev.chunks,
            bytes: message.audio_bytes_received || prev.bytes,
          }))
        }

        if (message.type === 'location_ack') {
          setSessionStats(prev => ({
            ...prev,
            sessionId: message.session_id || prev.sessionId,
            lastLocationAt: new Date().toLocaleTimeString(),
          }))
        }

        if (message.type === 'transcript_ack') {
          setSessionStats(prev => ({
            ...prev,
            transcripts: prev.transcripts + 1,
          }))
          addLogEntry({
            reason: 'Transcript received by realtime session',
            transcript: (message.transcript || '').substring(0, 100),
          })
        }

        if (message.type === 'threat_update') {
          const threat = message.threat || {}
          setThreatLevel(threat.level || 'SAFE')
          setSessionStats(prev => ({
            ...prev,
            sessionId: message.session_id || prev.sessionId,
            state: message.session_state || threat.state || prev.state,
            score: threat.score ?? prev.score,
          }))
          addLogEntry({
            level: threat.level || 'SAFE',
            reason: `${threat.summary || 'Threat update'} Score: ${threat.score ?? 0}. ${threat.reason || ''}`,
            transcript: (threat.signals || [])
              .map(signal => `${signal.name}+${signal.score}`)
              .join(', '),
          })

          if (threat.level === 'DANGER') {
            showToast('Danger detected. Alarm countdown started.', 'error')
          }
        }

        if (message.type === 'alarm_started') {
          setAlarm({
            active: true,
            remaining: message.countdown_seconds || 15,
            threat: message.threat,
          })
          setSosResult(null)
          addLogEntry({
            level: 'DANGER',
            reason: `Alarm started. SOS will send in ${message.countdown_seconds || 15} seconds unless cancelled.`,
            transcript: '',
          })
        }

        if (message.type === 'alarm_tick') {
          setAlarm(prev => prev ? { ...prev, remaining: message.remaining_seconds } : prev)
        }

        if (message.type === 'alarm_cancelled') {
          setAlarm(null)
          setThreatLevel('SAFE')
          setSessionStats(prev => ({
            ...prev,
            state: 'LISTENING',
            score: 0,
          }))
          addLogEntry({
            level: 'SAFE',
            reason: 'Alarm cancelled by user.',
            transcript: message.reason || '',
          })
          showToast('SOS cancelled', 'warning')
        }

        if (message.type === 'sos_sent') {
          setAlarm(null)
          setSosResult(message.notification)
          setSessionStats(prev => ({
            ...prev,
            state: 'SOS_SENT',
          }))
          addLogEntry({
            level: message.notification?.success ? 'DANGER' : 'SUSPICIOUS',
            reason: message.notification?.success
              ? 'SOS sent to emergency contacts.'
              : 'SOS attempted, but SMS delivery did not succeed.',
            transcript: '',
          })
          showToast(
            message.notification?.success ? 'SOS sent to emergency contacts' : 'SOS attempted, SMS failed',
            message.notification?.success ? 'success' : 'error'
          )
        }

        if (message.type === 'sos_error') {
          setAlarm(null)
          showToast(message.message || 'SOS failed', 'error')
        }

        if (message.type === 'error') {
          showToast(message.message || 'Realtime session error', 'error')
        }
      } catch (err) {
        console.log('WebSocket message parse error:', err)
      }
    }

    ws.onerror = () => {
      setWsStatus('error')
      showToast('Realtime connection failed', 'error')
    }

    ws.onclose = () => {
      setWsStatus('disconnected')
      if (locationIntervalRef.current) clearInterval(locationIntervalRef.current)
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current)
      locationIntervalRef.current = null
      pingIntervalRef.current = null
    }

    return ws
  }, [addLogEntry, getCurrentLocation, sendWsJson, showToast])

  const setupVisualizer = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      const analyser = audioContext.createAnalyser()
      const source = audioContext.createMediaStreamSource(stream)

      analyser.fftSize = 256
      source.connect(analyser)

      audioContextRef.current = audioContext
      analyserRef.current = analyser
      mediaStreamRef.current = stream

      const canvas = canvasRef.current
      if (!canvas) return stream

      const ctx = canvas.getContext('2d')
      canvas.width = canvas.offsetWidth * 2
      canvas.height = canvas.offsetHeight * 2

      const draw = () => {
        const bufferLength = analyser.frequencyBinCount
        const dataArray = new Uint8Array(bufferLength)
        analyser.getByteFrequencyData(dataArray)

        ctx.fillStyle = 'rgba(10, 10, 26, 0.3)'
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        const barWidth = (canvas.width / bufferLength) * 2.5
        let x = 0
        const colors = {
          SAFE: 'rgba(16, 185, 129, 0.65)',
          SUSPICIOUS: 'rgba(245, 158, 11, 0.65)',
          DANGER: 'rgba(239, 68, 68, 0.65)',
        }

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * canvas.height * 0.8
          ctx.fillStyle = colors[threatLevel] || colors.SAFE
          ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight)
          x += barWidth + 1
        }

        animationRef.current = requestAnimationFrame(draw)
      }

      draw()
      return stream
    } catch (err) {
      console.error('Microphone access error:', err)
      showToast('Microphone access required for Shield Mode', 'error')
      return null
    }
  }, [threatLevel, showToast])

  const startAudioStreaming = useCallback((stream) => {
    if (!stream || !window.MediaRecorder) {
      showToast('Audio streaming not supported in this browser', 'warning')
      return
    }

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'

    const recorder = new MediaRecorder(stream, { mimeType })
    recorder.ondataavailable = async (event) => {
      const ws = websocketRef.current
      if (!event.data.size || !ws || ws.readyState !== WebSocket.OPEN) return
      ws.send(await event.data.arrayBuffer())
    }
    recorder.onerror = () => showToast('Audio stream error', 'error')
    recorder.start(1000)
    mediaRecorderRef.current = recorder
  }, [showToast])

  const setupSpeechRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      showToast('Speech recognition not supported in this browser', 'warning')
      return null
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = (event) => {
      let transcript = ''
      let finalTranscript = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript
        }
      }

      setCurrentTranscript(transcript)

      const text = (finalTranscript || transcript).trim()
      if (text) {
        sendWsJson({
          type: 'transcript',
          text,
          is_final: Boolean(finalTranscript),
        })
      }
    }

    recognition.onerror = (event) => {
      console.log('Speech recognition error:', event.error)
      if ((event.error === 'no-speech' || event.error === 'aborted') && activeRef.current) {
        try { recognition.start() } catch (e) { /* ignore restart races */ }
      }
    }

    recognition.onend = () => {
      if (activeRef.current) {
        try { recognition.start() } catch (e) { /* ignore restart races */ }
      }
    }

    recognitionRef.current = recognition
    return recognition
  }, [sendWsJson, showToast])

  const cleanupRealtime = useCallback(() => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop() } catch (e) { /* ignore */ }
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
    }
    if (audioContextRef.current) {
      try { audioContextRef.current.close() } catch (e) { /* ignore */ }
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch (e) { /* ignore */ }
    }
    if (locationIntervalRef.current) clearInterval(locationIntervalRef.current)
    if (pingIntervalRef.current) clearInterval(pingIntervalRef.current)
    if (websocketRef.current) websocketRef.current.close()

    animationRef.current = null
    mediaRecorderRef.current = null
    mediaStreamRef.current = null
    audioContextRef.current = null
    recognitionRef.current = null
    websocketRef.current = null
    locationIntervalRef.current = null
    pingIntervalRef.current = null
  }, [])

  const activateShield = async () => {
    activeRef.current = true
    setActive(true)
    setThreatLevel('SAFE')
    setSessionStats({ sessionId: null, chunks: 0, bytes: 0, lastLocationAt: null, state: 'LISTENING', score: 0, transcripts: 0 })
    showToast('Shield Mode activated', 'success')

    connectRealtimeSession()

    const stream = await setupVisualizer()
    if (stream) {
      startAudioStreaming(stream)
    }

    const recognition = setupSpeechRecognition()
    if (recognition) {
      recognition.start()
      setListening(true)
    }
  }

  const deactivateShield = () => {
    if (alarm?.active) {
      sendWsJson({
        type: 'cancel_sos',
        reason: 'Shield Mode stopped by user',
      })
    }
    activeRef.current = false
    setActive(false)
    setListening(false)
    setThreatLevel('SAFE')
    setCurrentTranscript('')
    setAlarm(null)
    cleanupRealtime()
    showToast('Shield Mode deactivated', 'warning')
  }

  const cancelSos = () => {
    sendWsJson({
      type: 'cancel_sos',
      reason: 'User marked safe from Shield Mode',
    })
  }

  useEffect(() => cleanupRealtime, [cleanupRealtime])

  useEffect(() => {
    let lastMagnitude = 0
    const SHAKE_THRESHOLD = 25

    const handleMotion = (event) => {
      const { x, y, z } = event.accelerationIncludingGravity || {}
      if (x == null) return

      const magnitude = Math.sqrt(x * x + y * y + z * z)
      const delta = Math.abs(magnitude - lastMagnitude)
      lastMagnitude = magnitude

      if (delta > SHAKE_THRESHOLD) {
        triggerEmergency('shake')
      }
    }

    if (!(typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function')) {
      window.addEventListener('devicemotion', handleMotion)
    }

    return () => {
      window.removeEventListener('devicemotion', handleMotion)
    }
  }, [triggerEmergency])

  return (
    <>
      <div className="page-abstract-bg shield" aria-hidden="true">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>
    <div className="page-content page-enter shield-page">
      {/* Page Header */}
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/dashboard')} aria-label="Go back">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div style={{ flex: 1 }}>
          <span className="eyebrow" style={{ display: 'block', marginBottom: '2px' }}>AI Protection</span>
          <h2 style={{ lineHeight: 1.1 }}>Shield Mode</h2>
        </div>
      </div>

      <div className="shield-btn-container">
        <button
          className={`shield-btn ${active ? 'active' : ''}`}
          onClick={active ? deactivateShield : activateShield}
          aria-label={active ? 'Deactivate Shield Mode' : 'Activate Shield Mode'}
        >
          <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2l7 4v5c0 4.97-3.13 9.28-7 11-3.87-1.72-7-6.03-7-11V6l7-4z" />
          </svg>
          <span>{active ? 'STOP' : 'ACTIVATE'}</span>
        </button>
      </div>

      <p style={{ marginBottom: '22px', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', letterSpacing: '0.06em', color: active ? 'var(--emerald)' : 'var(--muted-foreground)', textAlign: 'center', textTransform: 'uppercase' }}>
        {active ? '● Listening and analyzing...' : 'Tap to start AI-powered monitoring'}
      </p>

      {/* Waveform & Analysis (active only) */}
      {active && (
        <>
          <div className="waveform-container">
            <canvas ref={canvasRef} aria-hidden="true" />
          </div>

          {/* Threat Indicator */}
          <div className={`threat-indicator ${threatLevel.toLowerCase()}`} role="status">
            {threatLevel === 'SAFE' && 'Environment is SAFE'}
            {threatLevel === 'SUSPICIOUS' && 'SUSPICIOUS activity detected'}
            {threatLevel === 'DANGER' && 'DANGER detected!'}
          </div>

          {currentTranscript && (
            <div className="glass-card-static" style={{ marginBottom: '14px', textAlign: 'left' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--muted-foreground)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Live Transcript
              </p>
              <p style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>{currentTranscript}</p>
            </div>
          )}

          <div className="analysis-log">
            <span className="eyebrow" style={{ display: 'block', marginBottom: '10px', textAlign: 'left' }}>Analysis Log</span>
            {analysisLog.length === 0 ? (
              <p className="text-muted" style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                Waiting for speech...
              </p>
            ) : (
              analysisLog.map((entry, i) => (
                <div key={i} className={`analysis-entry ${entry.level.toLowerCase()}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '0.72rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{entry.level}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--muted-foreground)' }}>{entry.timestamp}</span>
                  </div>
                  <p style={{ fontSize: '0.82rem' }}>{entry.reason}</p>
                  {entry.transcript && (
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--muted-foreground)', marginTop: '4px' }}>
                      &ldquo;{entry.transcript}&rdquo;
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Upload & Record — always visible */}
      <div className="upload-section" style={{ marginTop: '28px' }}>
        <span className="eyebrow" style={{ display: 'block', marginBottom: '6px' }}>Upload &amp; Analyze</span>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.82rem', color: 'var(--muted-foreground)', marginBottom: '16px' }}>
          Record a clip or pick an audio file &mdash; AI will check for threats.
        </p>

        {/* Record / Stop */}
        <div className="upload-actions">
          {!recording ? (
            <button id="shield-record-btn" className="btn btn-primary" onClick={startRecording} disabled={uploadingAudio} style={{ flex: 1 }}>
              Record Audio
            </button>
          ) : (
            <button id="shield-stop-btn" className="btn btn-danger" onClick={stopRecording} style={{ flex: 1 }}>
              Stop ({formatTime(recordingTime)})
            </button>
          )}

          <button
            id="shield-pick-file-btn"
            className="btn btn-outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={recording || uploadingAudio}
            style={{ flex: 1 }}
          >
            Pick File
          </button>

          <input ref={fileInputRef} type="file" accept="audio/*" style={{ display: 'none' }} onChange={handleFileSelect} />
        </div>

        {/* Recording indicator */}
        {recording && (
          <div className="recording-indicator" role="status" aria-live="polite">
            <span className="rec-dot" aria-hidden="true" />
            Recording&hellip; {formatTime(recordingTime)}
          </div>
        )}

        {/* Audio preview */}
        {(recordedBlob || selectedFile) && !recording && (
          <div className="audio-pending glass-card-static" style={{ marginTop: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                {recordedBlob ? `Recorded clip (${formatTime(recordingTime)})` : selectedFile?.name}
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => { discardRecording(); setSelectedFile(null) }} aria-label="Discard recording">
                &times;
              </button>
            </div>

            {recordedBlob && <audio controls src={URL.createObjectURL(recordedBlob)} style={{ width: '100%', marginBottom: '10px' }} />}
            {selectedFile && <audio controls src={URL.createObjectURL(selectedFile)} style={{ width: '100%', marginBottom: '10px' }} />}

            <button id="shield-analyze-btn" className="btn btn-primary btn-full" onClick={analyzeAudio} disabled={uploadingAudio}>
              {uploadingAudio ? (
                <><span className="spin" aria-hidden="true">⏳</span> Analyzing with AI&hellip;</>
              ) : 'Analyze for Threats'}
            </button>
          </div>
        )}

        {/* Upload result */}
        {uploadResult && (
          <div className={`upload-result glass-card-static threat-indicator ${uploadResult.threat_level?.toLowerCase()}`} style={{ marginTop: '14px', textAlign: 'left' }} role="alert">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.78rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {uploadResult.threat_level}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--muted-foreground)' }}>
                {Math.round((uploadResult.confidence || 0) * 100)}% confidence
              </span>
            </div>

            {uploadResult.transcript && (
              <div style={{ marginBottom: '8px' }}>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--muted-foreground)', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Transcript</p>
                <p style={{ fontSize: '0.83rem', fontStyle: 'italic' }}>&ldquo;{uploadResult.transcript}&rdquo;</p>
              </div>
            )}
            <div style={{ marginBottom: '8px' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--muted-foreground)', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Reason</p>
              <p style={{ fontSize: '0.83rem' }}>{uploadResult.reason}</p>
            </div>
            <div>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--muted-foreground)', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Recommended Action</p>
              <p style={{ fontSize: '0.83rem', fontWeight: 600 }}>{uploadResult.recommended_action}</p>
            </div>
          </div>
        )}
      </div>

      {/* How it works — inactive only */}
      {!active && (
        <div style={{ marginTop: '22px' }}>
          <div className="glass-card-static" style={{ marginBottom: '10px' }}>
            <span className="eyebrow" style={{ display: 'block', marginBottom: '10px' }}>How it works</span>
            <ol style={{ paddingLeft: '18px', color: 'var(--muted-foreground)', fontSize: '0.82rem', lineHeight: '1.85', fontFamily: 'var(--font-sans)' }}>
              <li>Tap <strong style={{ color: 'var(--foreground)' }}>ACTIVATE</strong> to start listening</li>
              <li>Audio is transcribed and analyzed every 5 seconds</li>
              <li>AI detects threats in real-time</li>
              <li>Alarm sounds if danger is detected</li>
              <li>Emergency contacts are alerted automatically</li>
            </ol>
          </div>

          <div className="glass-card-static" style={{ marginBottom: '10px' }}>
            <span className="eyebrow" style={{ display: 'block', marginBottom: '8px' }}>Upload Audio</span>
            <p style={{ color: 'var(--muted-foreground)', fontSize: '0.82rem', fontFamily: 'var(--font-sans)', lineHeight: 1.65 }}>
              Record a clip or select an existing audio file. The AI will listen and check for threats, harassment, or danger.
            </p>
          </div>

          <div className="glass-card-static">
            <span className="eyebrow" style={{ display: 'block', marginBottom: '8px' }}>Shake Detection</span>
            <p style={{ color: 'var(--muted-foreground)', fontSize: '0.82rem', fontFamily: 'var(--font-sans)', lineHeight: 1.65 }}>
              Motion detection is always active. A violent shake triggers an emergency check automatically.
            </p>
          </div>
        </div>
      )}
    </div>
    </>
  )
}
