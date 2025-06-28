'use client'

import { useState, useRef, useEffect } from 'react'
import { saveAs } from 'file-saver'
import { GEMINI_VOICES, EMOTION_STYLES } from './GeminiTTS'

interface Slide {
  slideNumber: number
  title: string
  content: string
  script?: string
}

interface ScriptMetadata {
  totalSlides: number
  style: string
  length: string
  useTutoyeren: boolean
  estimatedTimePerSlide: string
  wordsPerSlide: number[]
}

export default function PowerPointProcessor() {
  const [file, setFile] = useState<File | null>(null)
  const [slides, setSlides] = useState<Slide[]>([])
  const [scripts, setScripts] = useState<string[]>([])
  const [fullScript, setFullScript] = useState('')
  const [isExtracting, setIsExtracting] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [isConverting, setIsConverting] = useState(false)
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false)
  const [extractionError, setExtractionError] = useState('')
  const [generationError, setGenerationError] = useState('')
  const [scriptMetadata, setScriptMetadata] = useState<ScriptMetadata | null>(null)
  
  // Script generation settings
  const [scriptStyle, setScriptStyle] = useState<'professional' | 'casual' | 'educational'>('professional')
  const [scriptLength, setScriptLength] = useState<'beknopt' | 'normaal' | 'uitgebreid'>('normaal')
  const [useTutoyeren, setUseTutoyeren] = useState(false)

  // TTS Settings for Video Generation
  const [selectedGeminiVoice, setSelectedGeminiVoice] = useState(GEMINI_VOICES[3]) // Kore as default
  const [selectedGeminiEmotion, setSelectedGeminiEmotion] = useState(EMOTION_STYLES[0]) // Neutraal
  const [useGeminiTTS, setUseGeminiTTS] = useState(true) // Default to Gemini TTS for video
  const [showTTSSettings, setShowTTSSettings] = useState(false)
  const [videoProgress, setVideoProgress] = useState('')
  const [currentVideoSlide, setCurrentVideoSlide] = useState(0)

  // Video generation refs
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = async (selectedFile: File) => {
    if (!selectedFile.name.toLowerCase().endsWith('.pptx')) {
      setExtractionError('Alleen .pptx bestanden zijn toegestaan')
      return
    }

    setFile(selectedFile)
    setSlides([])
    setScripts([])
    setFullScript('')
    setExtractionError('')
    setGenerationError('')
    setScriptMetadata(null)
    setIsExtracting(true)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      const response = await fetch('/api/extract-slides', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Fout bij het verwerken van PowerPoint')
      }

      const data = await response.json()
      
      if (data.success && data.slides) {
        setSlides(data.slides)
        console.log(`✅ Successfully extracted ${data.slides.length} slides`)
      } else {
        throw new Error('Geen slides gevonden in het bestand')
      }
    } catch (error) {
      console.error('❌ Extraction error:', error)
      setExtractionError(error instanceof Error ? error.message : 'Onbekende fout bij extractie')
    } finally {
      setIsExtracting(false)
    }
  }

  const generateScript = async () => {
    if (slides.length === 0) return

    setIsGenerating(true)
    setGenerationError('')
    setScripts([])
    setFullScript('')
    setScriptMetadata(null)

    try {
      const response = await fetch('/api/generate-script', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          slides,
          style: scriptStyle,
          length: scriptLength,
          useTutoyeren
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Fout bij het genereren van script')
      }

      const data = await response.json()
      
      if (data.success) {
        setScripts(data.scripts)
        setFullScript(data.fullScript)
        setScriptMetadata(data.metadata)
        
        // Update slides with scripts
        const updatedSlides = slides.map((slide, index) => ({
          ...slide,
          script: data.scripts[index] || ''
        }))
        setSlides(updatedSlides)
        
        console.log('✅ Script generation successful')
      } else {
        throw new Error('Script generatie gefaald')
      }
    } catch (error) {
      console.error('❌ Script generation error:', error)
      setGenerationError(error instanceof Error ? error.message : 'Onbekende fout bij script generatie')
    } finally {
      setIsGenerating(false)
    }
  }

  const convertToTutoyeren = async () => {
    if (slides.length === 0 || scripts.length === 0) return

    setIsConverting(true)
    setGenerationError('')

    try {
      const response = await fetch('/api/convert-tutoyeren', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          slides: slides.map((slide, index) => ({
            slideNumber: slide.slideNumber,
            script: scripts[index] || ''
          }))
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Fout bij conversie naar tutoyeren')
      }

      const data = await response.json()
      
      if (data.success) {
        setScripts(data.scripts)
        setFullScript(data.fullScript)
        
        // Update slides with converted scripts
        const updatedSlides = slides.map((slide, index) => ({
          ...slide,
          script: data.scripts[index] || ''
        }))
        setSlides(updatedSlides)
        
        console.log('✅ Tutoyeren conversion successful')
      } else {
        throw new Error('Tutoyeren conversie gefaald')
      }
    } catch (error) {
      console.error('❌ Tutoyeren conversion error:', error)
      setGenerationError(error instanceof Error ? error.message : 'Onbekende fout bij tutoyeren conversie')
    } finally {
      setIsConverting(false)
    }
  }

  const downloadWithNotes = async () => {
    if (!file || slides.length === 0 || scripts.length === 0) return

    setIsDownloading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('slides', JSON.stringify(slides.map((slide, index) => ({
        slideNumber: slide.slideNumber,
        script: scripts[index] || ''
      }))))

      const response = await fetch('/api/add-notes', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Fout bij het toevoegen van notities')
      }

      const blob = await response.blob()
      const fileName = file.name.replace('.pptx', '_met_notities.pptx')
      saveAs(blob, fileName)
      
      console.log('✅ Download successful')
    } catch (error) {
      console.error('❌ Download error:', error)
      alert('Fout bij downloaden: ' + (error instanceof Error ? error.message : 'Onbekende fout'))
    } finally {
      setIsDownloading(false)
    }
  }

  // Generate TTS audio for a specific text
  const generateTTSAudio = async (text: string): Promise<Blob> => {
    const response = await fetch('/api/generate-tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text,
        voiceName: selectedGeminiVoice.name,
        style: selectedGeminiEmotion.name,
        multiSpeaker: false
      }),
    })

    if (!response.ok) {
      throw new Error(`TTS generation failed: ${response.status}`)
    }

    return await response.blob()
  }

  // Create slide visual for video
  const createSlideVisual = (slide: Slide, slideIndex: number): Promise<Blob> => {
    return new Promise((resolve) => {
      const canvas = canvasRef.current
      if (!canvas) {
        resolve(new Blob())
        return
      }

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(new Blob())
        return
      }

      // Set canvas size (16:9 aspect ratio)
      canvas.width = 1920
      canvas.height = 1080

      // Clear canvas with white background
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Add slide number
      ctx.fillStyle = '#666666'
      ctx.font = 'bold 48px Arial'
      ctx.textAlign = 'right'
      ctx.fillText(`Slide ${slide.slideNumber}`, canvas.width - 60, 80)

      // Add title
      ctx.fillStyle = '#1a1a1a'
      ctx.font = 'bold 72px Arial'
      ctx.textAlign = 'left'
      const titleLines = wrapText(ctx, slide.title, 120, 120, canvas.width - 240, 80)
      titleLines.forEach((line, index) => {
        ctx.fillText(line, 120, 200 + (index * 90))
      })

      // Add content
      ctx.fillStyle = '#333333'
      ctx.font = '48px Arial'
      const contentStartY = 200 + (titleLines.length * 90) + 60
      const contentLines = wrapText(ctx, slide.content, 120, contentStartY, canvas.width - 240, 60)
      contentLines.forEach((line, index) => {
        ctx.fillText(line, 120, contentStartY + (index * 70))
      })

      // Add decorative elements
      ctx.strokeStyle = '#4f46e5'
      ctx.lineWidth = 8
      ctx.beginPath()
      ctx.moveTo(120, 160)
      ctx.lineTo(canvas.width - 120, 160)
      ctx.stroke()

      // Convert canvas to blob
      canvas.toBlob((blob) => {
        resolve(blob || new Blob())
      }, 'image/png')
    })
  }

  // Helper function to wrap text
  const wrapText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number): string[] => {
    const words = text.split(' ')
    const lines: string[] = []
    let currentLine = ''

    for (const word of words) {
      const testLine = currentLine + word + ' '
      const metrics = ctx.measureText(testLine)
      const testWidth = metrics.width

      if (testWidth > maxWidth && currentLine !== '') {
        lines.push(currentLine.trim())
        currentLine = word + ' '
      } else {
        currentLine = testLine
      }
    }
    lines.push(currentLine.trim())
    return lines
  }

  // Generate video with slides and TTS
  const generateVideo = async () => {
    if (slides.length === 0 || scripts.length === 0) {
      alert('Eerst slides en scripts genereren!')
      return
    }

    setIsGeneratingVideo(true)
    setVideoProgress('Video generatie wordt voorbereid...')
    setCurrentVideoSlide(0)
    recordedChunksRef.current = []

    try {
      const canvas = canvasRef.current
      const video = videoRef.current
      
      if (!canvas || !video) {
        throw new Error('Canvas of video element niet beschikbaar')
      }

      // Setup video recording
      const stream = canvas.captureStream(30) // 30 FPS
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9'
      })
      
      mediaRecorderRef.current = mediaRecorder
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${file?.name.replace('.pptx', '')}_presentatie_video.webm`
        a.click()
        URL.revokeObjectURL(url)
        
        setVideoProgress('Video succesvol gegenereerd en gedownload!')
        setTimeout(() => {
          setIsGeneratingVideo(false)
          setVideoProgress('')
          setCurrentVideoSlide(0)
        }, 3000)
      }

      // Start recording
      mediaRecorder.start()
      setVideoProgress('Video opname gestart...')

      // Process each slide
      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i]
        const script = scripts[i]
        
        if (!script) continue

        setCurrentVideoSlide(i + 1)
        setVideoProgress(`Slide ${i + 1}/${slides.length}: ${slide.title.substring(0, 30)}...`)

        // Create slide visual
        await createSlideVisual(slide, i)
        
        // Generate and play TTS audio
        try {
          const audioBlob = await generateTTSAudio(script)
          const audioUrl = URL.createObjectURL(audioBlob)
          const audio = new Audio(audioUrl)
          
          // Wait for audio to finish playing
          await new Promise<void>((resolve, reject) => {
            audio.onended = () => {
              URL.revokeObjectURL(audioUrl)
              resolve()
            }
            audio.onerror = () => {
              URL.revokeObjectURL(audioUrl)
              reject(new Error('Audio playback failed'))
            }
            audio.play().catch(reject)
          })
          
          // Add small pause between slides
          await new Promise(resolve => setTimeout(resolve, 1000))
          
        } catch (audioError) {
          console.error(`Audio error for slide ${i + 1}:`, audioError)
          // Continue with next slide even if audio fails
          await new Promise(resolve => setTimeout(resolve, 3000)) // 3 second fallback
        }
      }

      // Stop recording
      setVideoProgress('Video wordt afgerond...')
      mediaRecorder.stop()

    } catch (error) {
      console.error('❌ Video generation error:', error)
      setVideoProgress('Fout bij video generatie: ' + (error instanceof Error ? error.message : 'Onbekende fout'))
      setIsGeneratingVideo(false)
      setTimeout(() => {
        setVideoProgress('')
        setCurrentVideoSlide(0)
      }, 5000)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-full mb-4">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        
        <h2 className="text-3xl font-bold text-gray-800 mb-4">
          PowerPoint Script Generator
        </h2>
        
        <p className="text-lg text-blue-700 mb-6">
          Upload je PowerPoint, krijg een professioneel script, en download met notities
        </p>
      </div>

      {/* File Upload */}
      <div className="mb-8">
        <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 transition-colors">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          
          <h3 className="text-xl font-semibold text-gray-700 mb-2">
            Upload PowerPoint Bestand
          </h3>
          
          <p className="text-gray-500 mb-4">
            Sleep je .pptx bestand hier naartoe of klik om te selecteren
          </p>
          
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            📁 Selecteer Bestand
          </button>
          
          <input
            ref={fileInputRef}
            type="file"
            accept=".pptx"
            onChange={(e) => {
              const selectedFile = e.target.files?.[0]
              if (selectedFile) {
                handleFileUpload(selectedFile)
              }
            }}
            className="hidden"
          />
        </div>
        
        {file && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-blue-800 font-medium">{file.name}</span>
              <span className="text-blue-600 text-sm ml-2">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
            </div>
          </div>
        )}
      </div>

      {/* Extraction Status */}
      {isExtracting && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-yellow-600 mr-3"></div>
            <span className="text-yellow-800 font-medium">PowerPoint wordt geanalyseerd...</span>
          </div>
          <p className="text-yellow-700 text-sm mt-2">Dit kan even duren voor complexe presentaties</p>
        </div>
      )}

      {extractionError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-red-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-red-800 font-medium">Extractie Fout</span>
          </div>
          <p className="text-red-700 text-sm mt-1">{extractionError}</p>
        </div>
      )}

      {/* Slides Preview */}
      {slides.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-gray-800">
              Geëxtraheerde Slides ({slides.length})
            </h3>
          </div>
          
          <div className="grid gap-4 max-h-96 overflow-y-auto">
            {slides.map((slide, index) => (
              <div key={slide.slideNumber} className="slide-preview">
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-semibold text-gray-800 line-clamp-1">
                    Slide {slide.slideNumber}: {slide.title}
                  </h4>
                </div>
                <p className="text-gray-600 text-sm line-clamp-3 mb-3">
                  {slide.content}
                </p>
                
                {slide.script && (
                  <div className="script-section">
                    <h5 className="font-medium text-blue-800 mb-2">📝 Gegenereerd Script:</h5>
                    <p className="text-gray-700 text-sm leading-relaxed">
                      {slide.script}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Script Generation Settings */}
      {slides.length > 0 && (
        <div className="mb-8 p-6 bg-gray-50 rounded-xl">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Script Instellingen</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {/* Style Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Stijl</label>
              <select
                value={scriptStyle}
                onChange={(e) => setScriptStyle(e.target.value as 'professional' | 'casual' | 'educational')}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="professional">🏢 Professioneel</option>
                <option value="casual">😊 Informeel</option>
                <option value="educational">🎓 Educatief</option>
              </select>
            </div>

            {/* Length Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Lengte</label>
              <select
                value={scriptLength}
                onChange={(e) => setScriptLength(e.target.value as 'beknopt' | 'normaal' | 'uitgebreid')}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="beknopt">⚡ Beknopt (15-30 sec/slide)</option>
                <option value="normaal">📝 Normaal (30-45 sec/slide)</option>
                <option value="uitgebreid">📚 Uitgebreid (45-60 sec/slide)</option>
              </select>
            </div>

            {/* Tutoyeren Toggle */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Aanspreekvorm</label>
              <div className="flex items-center space-x-3 p-3 border border-gray-300 rounded-lg">
                <input
                  type="checkbox"
                  id="tutoyeren"
                  checked={useTutoyeren}
                  onChange={(e) => setUseTutoyeren(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="tutoyeren" className="text-sm text-gray-700">
                  Gebruik "jij/jouw" (tutoyeren)
                </label>
              </div>
            </div>
          </div>

          {/* Generate Script Button */}
          <button
            onClick={generateScript}
            disabled={isGenerating || slides.length === 0}
            className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <span className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Script wordt gegenereerd...
              </span>
            ) : (
              <span className="flex items-center justify-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                🤖 Genereer Script met Gemini AI
              </span>
            )}
          </button>
        </div>
      )}

      {/* Script Generation Status */}
      {isGenerating && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-3"></div>
            <span className="text-blue-800 font-medium">Gemini AI genereert je script...</span>
          </div>
          <p className="text-blue-700 text-sm mt-2">Dit kan 30-60 seconden duren voor de beste kwaliteit</p>
        </div>
      )}

      {generationError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-red-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-red-800 font-medium">Script Generatie Fout</span>
          </div>
          <p className="text-red-700 text-sm mt-1">{generationError}</p>
        </div>
      )}

      {/* Script Metadata */}
      {scriptMetadata && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <h4 className="font-semibold text-green-800 mb-2">✅ Script Succesvol Gegenereerd!</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-green-700 font-medium">Slides:</span>
              <span className="text-green-600 ml-1">{scriptMetadata.totalSlides}</span>
            </div>
            <div>
              <span className="text-green-700 font-medium">Stijl:</span>
              <span className="text-green-600 ml-1 capitalize">{scriptMetadata.style}</span>
            </div>
            <div>
              <span className="text-green-700 font-medium">Lengte:</span>
              <span className="text-green-600 ml-1 capitalize">{scriptMetadata.length}</span>
            </div>
            <div>
              <span className="text-green-700 font-medium">Tijd/slide:</span>
              <span className="text-green-600 ml-1">{scriptMetadata.estimatedTimePerSlide}</span>
            </div>
          </div>
        </div>
      )}

      {/* TTS Settings for Video Generation */}
      {scripts.length > 0 && (
        <div className="mb-8 p-6 bg-purple-50 border border-purple-200 rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-purple-800">🎤 Video TTS Instellingen</h3>
            <button
              onClick={() => setShowTTSSettings(!showTTSSettings)}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              {showTTSSettings ? 'Verberg Instellingen' : 'Toon Instellingen'}
            </button>
          </div>

          {showTTSSettings && (
            <div className="space-y-4">
              {/* TTS Engine Selection */}
              <div>
                <label className="block text-purple-700 text-sm font-medium mb-2">🎙️ TTS Engine</label>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setUseGeminiTTS(false)}
                    className={`flex-1 px-3 py-2 text-sm rounded-lg transition-all duration-200 ${
                      !useGeminiTTS
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-blue-100 border border-gray-200'
                    }`}
                  >
                    🔊 Microsoft TTS
                  </button>
                  <button
                    onClick={() => setUseGeminiTTS(true)}
                    className={`flex-1 px-3 py-2 text-sm rounded-lg transition-all duration-200 ${
                      useGeminiTTS
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-purple-100 border border-gray-200'
                    }`}
                  >
                    🚀 Gemini AI TTS
                  </button>
                </div>
              </div>

              {/* Gemini TTS Settings */}
              {useGeminiTTS && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-purple-700 text-sm font-medium mb-2">🎭 Gemini Stemkeuze</label>
                    <select
                      value={selectedGeminiVoice.name}
                      onChange={(e) => {
                        const voice = GEMINI_VOICES.find(v => v.name === e.target.value)
                        if (voice) setSelectedGeminiVoice(voice)
                      }}
                      className="w-full p-3 border border-purple-200 rounded-lg bg-white text-purple-700 focus:ring-2 focus:ring-purple-500"
                    >
                      {GEMINI_VOICES.map((voice) => (
                        <option key={voice.name} value={voice.name}>
                          {voice.name} - {voice.description}
                        </option>
                      ))}
                    </select>
                    <p className="text-purple-600 text-xs mt-1">
                      Geselecteerd: {selectedGeminiVoice.name} ({selectedGeminiVoice.style})
                    </p>
                  </div>

                  <div>
                    <label className="block text-purple-700 text-sm font-medium mb-2">😊 Emotie</label>
                    <div className="grid grid-cols-3 gap-2">
                      {EMOTION_STYLES.map((emotion) => (
                        <button
                          key={emotion.name}
                          onClick={() => setSelectedGeminiEmotion(emotion)}
                          className={`px-3 py-2 text-xs rounded-lg transition-all duration-200 ${
                            selectedGeminiEmotion.name === emotion.name
                              ? 'bg-purple-600 text-white'
                              : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
                          }`}
                        >
                          {emotion.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Video Generation */}
      {scripts.length > 0 && (
        <div className="mb-8 p-6 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl">
          <h3 className="text-lg font-semibold text-indigo-800 mb-4">🎬 Genereer Presentatie Video</h3>
          
          <div className="bg-white p-4 rounded-lg border border-indigo-200 mb-4">
            <div className="flex items-start space-x-3">
              <svg className="w-6 h-6 text-indigo-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <div>
                <h4 className="font-medium text-indigo-800 mb-2">Video Functionaliteiten:</h4>
                <ul className="text-sm text-indigo-700 space-y-1">
                  <li>• 📺 Elke slide wordt visueel weergegeven</li>
                  <li>• 🎙️ Script wordt voorgelezen met {useGeminiTTS ? `Gemini TTS (${selectedGeminiVoice.name})` : 'Microsoft TTS'}</li>
                  <li>• ⏭️ Automatisch doorschakelen naar volgende slide</li>
                  <li>• 💾 Download als WebM video bestand</li>
                  <li>• 🎨 Professionele slide layouts</li>
                </ul>
              </div>
            </div>
          </div>

          {isGeneratingVideo && (
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center mb-2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-3"></div>
                <span className="text-blue-800 font-medium">Video wordt gegenereerd...</span>
              </div>
              <p className="text-blue-700 text-sm mb-2">{videoProgress}</p>
              {currentVideoSlide > 0 && (
                <div className="w-full bg-blue-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(currentVideoSlide / slides.length) * 100}%` }}
                  ></div>
                </div>
              )}
            </div>
          )}

          <button
            onClick={generateVideo}
            disabled={isGeneratingVideo || scripts.length === 0}
            className="w-full px-6 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGeneratingVideo ? (
              <span className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Video wordt gegenereerd... ({currentVideoSlide}/{slides.length})
              </span>
            ) : (
              <span className="flex items-center justify-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                🎬 Genereer Presentatie Video ({slides.length} slides)
              </span>
            )}
          </button>
        </div>
      )}

      {/* Action Buttons */}
      {scripts.length > 0 && (
        <div className="space-y-4">
          {/* Convert to Tutoyeren */}
          {!useTutoyeren && (
            <button
              onClick={convertToTutoyeren}
              disabled={isConverting}
              className="w-full px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isConverting ? (
                <span className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Converteren naar tutoyeren...
                </span>
              ) : (
                <span className="flex items-center justify-center">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  🗣️ Converteer naar "jij/jouw" (tutoyeren)
                </span>
              )}
            </button>
          )}

          {/* Download with Notes */}
          <button
            onClick={downloadWithNotes}
            disabled={isDownloading || !file}
            className="w-full px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDownloading ? (
              <span className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                PowerPoint wordt voorbereid...
              </span>
            ) : (
              <span className="flex items-center justify-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                📥 Download PowerPoint met Script in Notities
              </span>
            )}
          </button>
        </div>
      )}

      {/* Hidden Canvas and Video for Video Generation */}
      <canvas ref={canvasRef} className="hidden" />
      <video ref={videoRef} className="hidden" />
    </div>
  )
}