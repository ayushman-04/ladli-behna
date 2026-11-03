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
  const [audioUrl, setAudioUrl] = useState(null)
  const [micPermissionDenied, setMicPermissionDenied] = useState(false)
  const [analysisStatus, setAnalysisStatus] = useState('idle') // idle | processing | available | unavailable

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

  // --- Upload / Record refs ---
  const fileInputRef = useRef(null)
  const uploadRecorderRef = useRef(null)   // separate MediaRecorder for the upload section
  const uploadStreamRef = useRef(null)     // mic stream used only for upload recording
  const recordingTimerRef = useRef(null)   // setInterval id for the duration counter
  const recordingChunksRef = useRef([])    // audio chunks accumulated during recording
  const isRecordingRef = useRef(false)     // synchronous lock preventing overlapping recording sessions

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
    const hasMediaRecorder = typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined'
    if (!stream || !hasMediaRecorder) {
      showToast('Audio streaming not supported in this browser', 'warning')
      return
    }

    const isTypeSupported = typeof window.MediaRecorder.isTypeSupported === 'function'
      ? (type) => window.MediaRecorder.isTypeSupported(type)
      : () => false

    const mimeType = isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : isTypeSupported('audio/webm')
        ? 'audio/webm'
        : ''

    let recorder
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
    } catch (e) {
      showToast('Failed to initialize audio streaming', 'warning')
      return
    }

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

  // ================================================================
  // UPLOAD / RECORD HELPERS  (fixes ReferenceError: not defined)
  // ================================================================

  /** Format seconds as MM:SS */
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  /** Discard the current recording or selected file and reset upload state */
  const discardRecording = useCallback(() => {
    if (isRecordingRef.current) {
      isRecordingRef.current = false
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
        recordingTimerRef.current = null
      }
      if (uploadRecorderRef.current && uploadRecorderRef.current.state !== 'inactive') {
        try { uploadRecorderRef.current.stop() } catch (e) { /* ignore */ }
      }
      if (uploadStreamRef.current) {
        uploadStreamRef.current.getTracks().forEach(t => t.stop())
        uploadStreamRef.current = null
      }
      uploadRecorderRef.current = null
      setRecording(false)
    }

    setRecordedBlob(null)
    setSelectedFile(null)
    setUploadResult(null)
    setAnalysisStatus('idle')
    setRecordingTime(0)
    recordingChunksRef.current = []
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  // Safely manage audio preview URL and revoke when done to prevent memory leaks
  useEffect(() => {
    const source = recordedBlob || selectedFile
    if (source) {
      const url = URL.createObjectURL(source)
      setAudioUrl(url)
      return () => {
        URL.revokeObjectURL(url)
      }
    } else {
      setAudioUrl(null)
    }
  }, [recordedBlob, selectedFile])

  /** Stop mic stream and timer used by the upload recorder */
  const _stopUploadRecorderCleanup = useCallback(() => {
    isRecordingRef.current = false
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
    if (uploadRecorderRef.current && uploadRecorderRef.current.state !== 'inactive') {
      try { uploadRecorderRef.current.stop() } catch (e) { /* ignore */ }
    }
    if (uploadStreamRef.current) {
      uploadStreamRef.current.getTracks().forEach(t => t.stop())
      uploadStreamRef.current = null
    }
    uploadRecorderRef.current = null
    setRecording(false)
  }, [])

  /** Start a new audio recording for the upload / analyze section */
  const startRecording = useCallback(async () => {
    // Guard: synchronous ref lock prevents overlapping recording sessions
    if (isRecordingRef.current) return
    isRecordingRef.current = true

    setMicPermissionDenied(false)
    discardRecording()
    setSelectedFile(null)

    if (!navigator?.mediaDevices?.getUserMedia) {
      isRecordingRef.current = false
      showToast('Microphone access is not supported in this browser.', 'error')
      return
    }

    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    } catch (err) {
      isRecordingRef.current = false
      setRecording(false)
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMicPermissionDenied(true)
        showToast('Microphone permission denied. Please allow mic access and try again.', 'error')
      } else {
        showToast(`Microphone error: ${err.message || err.name}`, 'error')
      }
      return
    }

    uploadStreamRef.current = stream
    recordingChunksRef.current = []

    const hasMediaRecorder = typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined'
    if (!hasMediaRecorder) {
      showToast('Audio recording is not supported in this browser', 'error')
      if (stream) {
        stream.getTracks().forEach(t => t.stop())
        uploadStreamRef.current = null
      }
      isRecordingRef.current = false
      setRecording(false)
      return
    }

    const isTypeSupported = typeof window.MediaRecorder.isTypeSupported === 'function'
      ? (type) => window.MediaRecorder.isTypeSupported(type)
      : () => false

    const mimeType = isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : isTypeSupported('audio/webm')
        ? 'audio/webm'
        : ''

    let recorder
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
    } catch (err) {
      showToast(`Recording not supported in this browser: ${err.message}`, 'error')
      stream.getTracks().forEach(t => t.stop())
      uploadStreamRef.current = null
      isRecordingRef.current = false
      setRecording(false)
      return
    }

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordingChunksRef.current.push(e.data)
      }
    }

    recorder.onerror = (e) => {
      showToast(`Recording error: ${e.error?.message || 'Unknown error'}`, 'error')
      isRecordingRef.current = false
      setRecording(false)
      _stopUploadRecorderCleanup()
    }

    recorder.onstop = () => {
      const chunks = recordingChunksRef.current
      if (chunks.length > 0) {
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        setRecordedBlob(blob)
      } else {
        showToast('No audio was captured. Check your microphone.', 'warning')
      }
      recordingChunksRef.current = []
    }

    uploadRecorderRef.current = recorder
    try {
      recorder.start(250) // collect chunks every 250 ms
      setRecording(true)
      setRecordingTime(0)

      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
    } catch (startErr) {
      showToast(`Failed to start recording: ${startErr.message}`, 'error')
      _stopUploadRecorderCleanup()
    }
  }, [discardRecording, showToast, _stopUploadRecorderCleanup])

  /** Stop the active upload recording */
  const stopRecording = useCallback(() => {
    isRecordingRef.current = false
    const recorder = uploadRecorderRef.current

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }

    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.requestData() // flush remaining data
        recorder.stop()
      } catch (e) {
        console.warn('stopRecording error:', e)
      }
    }

    if (uploadStreamRef.current) {
      uploadStreamRef.current.getTracks().forEach(t => t.stop())
      uploadStreamRef.current = null
    }

    uploadRecorderRef.current = null
    setRecording(false)
  }, [])

  /** Handle audio file picked via the file input */
  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Reset any previous recording / result
    discardRecording()
    setSelectedFile(file)
    setUploadResult(null)
    setAnalysisStatus('idle')

    // Reset the file input value so the same file can be re-selected later
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [discardRecording])

  /** Upload and analyze the current recording or selected file */
  const analyzeAudio = useCallback(async () => {
    const audioSource = recordedBlob || selectedFile
    if (!audioSource) return
    if (uploadingAudio) return // prevent duplicate submissions

    const token = localStorage.getItem('shieldher_token')
    if (!token) {
      showToast('Please log in to use audio analysis', 'error')
      return
    }

    setUploadingAudio(true)
    setUploadResult(null)
    setAnalysisStatus('processing')

    try {
      const form = new FormData()
      const filename = selectedFile
        ? selectedFile.name
        : `recording_${Date.now()}.webm`
      form.append('audio', audioSource, filename)

      // Optionally attach location inside try lifecycle
      if (navigator.geolocation) {
        try {
          await new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                form.append('latitude', pos.coords.latitude)
                form.append('longitude', pos.coords.longitude)
                resolve()
              },
              () => resolve(), // location optional — continue without it
              { timeout: 3000 }
            )
          })
        } catch (geoErr) {
          // Geolocation failure is non-blocking
        }
      }

      const res = await fetch(`${API_BASE}/api/audio/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })

      let data = null
      try {
        data = await res.json()
      } catch (parseErr) {
        data = null
      }

      if (!res.ok) {
        const errMsg = data?.detail || `Server error ${res.status}`
        showToast(`Upload failed: ${errMsg}`, 'error')
        setAnalysisStatus('unavailable')
        // Show ANALYSIS UNAVAILABLE — never classify an API failure as SAFE
        setUploadResult({
          threat_level: 'ANALYSIS UNAVAILABLE',
          confidence: 0,
          reason: errMsg,
          recommended_action: 'Analysis service is unavailable. Manual SOS is available below.',
          transcript: '',
        })
        return
      }

      const analysis = data?.analysis
      if (!analysis) {
        showToast('Unexpected response from server', 'error')
        setAnalysisStatus('unavailable')
        setUploadResult({
          threat_level: 'ANALYSIS UNAVAILABLE',
          confidence: 0,
          reason: 'Server returned an empty analysis.',
          recommended_action: 'Try again or use manual SOS if needed.',
          transcript: '',
        })
        return
      }

      // Detect API key absent, demo mode, or error reported by backend
      const reasonText = (analysis.reason || '').toLowerCase()
      const isUnavailable =
        analysis.threat_level === 'ANALYSIS UNAVAILABLE' ||
        analysis.threat_level === 'ERROR' ||
        (analysis.threat_level === 'SAFE' && analysis.confidence === 0) ||
        reasonText.includes('not configured') ||
        reasonText.includes('demo mode') ||
        reasonText.includes('temporarily unavailable') ||
        reasonText.includes('analysis error') ||
        reasonText.includes('error code') ||
        reasonText.includes('incorrect api key') ||
        reasonText.includes('invalid_api_key') ||
        reasonText.includes('api key') ||
        reasonText.includes('failed')

      if (isUnavailable) {
        setAnalysisStatus('unavailable')
        setUploadResult({
          ...analysis,
          threat_level: 'ANALYSIS UNAVAILABLE',
          confidence: 0,
          reason: analysis.reason || 'AI analysis is unavailable (API key not configured or invalid). Local keyword-based detection remains active.',
          recommended_action: 'Use manual SOS if you feel unsafe. Stay alert.',
        })
      } else {
        setAnalysisStatus('available')
        setUploadResult(analysis)
        if (analysis.threat_level === 'DANGER') {
          showToast('DANGER detected in audio! Stay safe.', 'error')
        } else if (analysis.threat_level === 'SUSPICIOUS') {
          showToast('Suspicious activity detected in audio.', 'warning')
        } else {
          showToast('Audio analysis complete — environment appears safe.', 'success')
        }
      }
    } catch (err) {
      const msg = err?.message || 'Network error'
      showToast(`Analysis failed: ${msg}`, 'error')
      setAnalysisStatus('unavailable')
      setUploadResult({
        threat_level: 'ANALYSIS UNAVAILABLE',
        confidence: 0,
        reason: `Connection error: ${msg}`,
        recommended_action: 'Check that backend is running and try again. Use manual SOS if in danger.',
        transcript: '',
      })
    } finally {
      setUploadingAudio(false)
    }
  }, [recordedBlob, selectedFile, uploadingAudio, showToast])

  // Cleanup upload recorder on unmount
  useEffect(() => () => {
    _stopUploadRecorderCleanup()
  }, [_stopUploadRecorderCleanup])

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

        {/* Microphone permission denied banner */}
        {micPermissionDenied && (
          <div role="alert" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: '10px', padding: '10px 14px', marginBottom: '12px', fontSize: '0.82rem', color: 'var(--danger, #ef4444)', lineHeight: 1.5 }}>
            <strong>Microphone access denied.</strong> Please allow microphone permissions in your browser settings and reload the page.
          </div>
        )}

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
              <button className="btn btn-ghost btn-sm" onClick={discardRecording} aria-label="Discard recording">
                &times;
              </button>
            </div>

            {audioUrl && <audio controls src={audioUrl} style={{ width: '100%', marginBottom: '10px' }} />}

            <button id="shield-analyze-btn" className="btn btn-primary btn-full" onClick={analyzeAudio} disabled={uploadingAudio}>
              {uploadingAudio ? (
                <><span className="spin" aria-hidden="true">⏳</span> Processing&hellip;</>
              ) : analysisStatus === 'processing' ? 'Processing…' : 'Analyze for Threats'}
            </button>
          </div>
        )}

        {/* Analysis status label */}
        {analysisStatus === 'processing' && (
          <p role="status" aria-live="polite" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--muted-foreground)', textAlign: 'center', marginTop: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            ⏳ Processing audio…
          </p>
        )}
        {analysisStatus === 'unavailable' && !uploadResult && (
          <p role="alert" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--danger, #ef4444)', textAlign: 'center', marginTop: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            ⚠ ANALYSIS UNAVAILABLE
          </p>
        )}

        {/* Upload result */}
        {uploadResult && (
          <div
            className={`upload-result glass-card-static${uploadResult.threat_level === 'ANALYSIS UNAVAILABLE' ? '' : ` threat-indicator ${uploadResult.threat_level?.toLowerCase()}`}`}
            style={uploadResult.threat_level === 'ANALYSIS UNAVAILABLE'
              ? { marginTop: '14px', textAlign: 'left', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.07)', borderRadius: '12px', padding: '14px' }
              : { marginTop: '14px', textAlign: 'left' }}
            role="alert"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.78rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: uploadResult.threat_level === 'ANALYSIS UNAVAILABLE' ? 'var(--danger, #ef4444)' : undefined }}>
                {uploadResult.threat_level}
              </span>
              {uploadResult.threat_level !== 'ANALYSIS UNAVAILABLE' && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--muted-foreground)' }}>
                  {Math.round((uploadResult.confidence || 0) * 100)}% confidence
                </span>
              )}
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

            {/* Quick manual SOS when threat is danger or analysis unavailable */}
            {(uploadResult.threat_level === 'DANGER' || uploadResult.threat_level === 'ANALYSIS UNAVAILABLE') && (
              <button
                id="shield-result-sos-btn"
                className="btn btn-danger btn-full"
                onClick={() => triggerEmergency('shield_audio')}
                style={{ marginTop: '12px' }}
              >
                🚨 Trigger Emergency SOS
              </button>
            )}
          </div>
        )}

        {/* Persistent Manual SOS trigger */}
        <div style={{ marginTop: '16px' }}>
          <button
            id="shield-manual-sos-btn"
            className="btn btn-danger btn-full"
            onClick={() => triggerEmergency('shield_manual')}
            aria-label="Trigger Emergency SOS"
          >
            🚨 Emergency SOS
          </button>
        </div>
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
