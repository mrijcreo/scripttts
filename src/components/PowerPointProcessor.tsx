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
  const [isGeneratingTTSPowerPoint, setIsGeneratingTTSPowerPoint] = useState(false)
  const [extractionError, setExtractionError] = useState('')
  const [generationError, setGenerationError] = useState('')
  const [scriptMetadata, setScriptMetadata] = useState<ScriptMetadata | null>(null)
  
  // Script editing state
  const [editingScriptIndex, setEditingScriptIndex] = useState<number | null>(null)
  const [editingScriptText, setEditingScriptText] = useState('')
  
  // Script generation settings
  const [scriptStyle, setScriptStyle] = useState<'professional' | 'casual' | 'educational'>('professional')
  const [scriptLength, setScriptLength] = useState<'beknopt' | 'normaal' | 'uitgebreid'>('normaal')
  const [useTutoyeren, setUseTutoyeren] = useState(false)

  // TTS Settings for PowerPoint Generation
  const [selectedGeminiVoice, setSelectedGeminiVoice] = useState(GEMINI_VOICES[3]) // Kore as default
  const [selectedGeminiEmotion, setSelectedGeminiEmotion] = useState(EMOTION_STYLES[0]) // Neutraal
  const [useGeminiTTS, setUseGeminiTTS] = useState(true) // Default to Gemini TTS
  const [showTTSSettings, setShowTTSSettings] = useState(false)
  const [ttsProgress, setTtsProgress] = useState('')
  const [currentTTSSlide, setCurrentTTSSlide] = useState(0)

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
    setEditingScriptIndex(null)
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
    setEditingScriptIndex(null)

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

  // Script editing functions
  const startEditingScript = (index: number) => {
    setEditingScriptIndex(index)
    setEditingScriptText(scripts[index] || '')
  }

  const saveEditedScript = () => {
    if (editingScriptIndex !== null) {
      const updatedScripts = [...scripts]
      updatedScripts[editingScriptIndex] = editingScriptText
      setScripts(updatedScripts)
      
      // Update slides with edited script
      const updatedSlides = slides.map((slide, index) => ({
        ...slide,
        script: index === editingScriptIndex ? editingScriptText : slide.script
      }))
      setSlides(updatedSlides)
      
      // Update full script
      setFullScript(updatedScripts.join('\n\n'))
      
      setEditingScriptIndex(null)
      setEditingScriptText('')
    }
  }

  const cancelEditingScript = () => {
    setEditingScriptIndex(null)
    setEditingScriptText('')
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

  // Generate PowerPoint with TTS audio embedded in notes
  const generatePowerPointWithTTS = async () => {
    if (!file || slides.length === 0 || scripts.length === 0) {
      alert('Eerst slides en scripts genereren!')
      return
    }

    setIsGeneratingTTSPowerPoint(true)
    setTtsProgress('PowerPoint met TTS wordt voorbereid...')
    setCurrentTTSSlide(0)

    try {
      // First, generate all TTS audio files
      const audioBlobs: Blob[] = []
      
      for (let i = 0; i < scripts.length; i++) {
        const script = scripts[i]
        if (!script) continue

        setCurrentTTSSlide(i + 1)
        setTtsProgress(`TTS audio genereren voor slide ${i + 1}/${scripts.length}...`)

        try {
          const audioBlob = await generateTTSAudio(script)
          audioBlobs.push(audioBlob)
          console.log(`✅ TTS generated for slide ${i + 1}`)
        } catch (audioError) {
          console.error(`❌ TTS error for slide ${i + 1}:`, audioError)
          // Create empty blob as fallback
          audioBlobs.push(new Blob())
        }
      }

      setTtsProgress('PowerPoint wordt samengesteld met TTS audio...')

      // Create enhanced slides data with TTS audio
      const enhancedSlides = slides.map((slide, index) => ({
        slideNumber: slide.slideNumber,
        script: scripts[index] || '',
        audioBlob: audioBlobs[index] || null
      }))

      // Send to API for PowerPoint generation with embedded audio
      const formData = new FormData()
      formData.append('file', file)
      formData.append('slides', JSON.stringify(enhancedSlides.map(slide => ({
        slideNumber: slide.slideNumber,
        script: slide.script
      }))))

      // Add audio files to form data
      enhancedSlides.forEach((slide, index) => {
        if (slide.audioBlob && slide.audioBlob.size > 0) {
          formData.append(`audio_${index}`, slide.audioBlob, `slide_${slide.slideNumber}_audio.wav`)
        }
      })

      const response = await fetch('/api/add-notes', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Fout bij het genereren van PowerPoint met TTS')
      }

      const blob = await response.blob()
      const fileName = file.name.replace('.pptx', '_met_TTS_notities.pptx')
      saveAs(blob, fileName)
      
      setTtsProgress('PowerPoint met TTS succesvol gedownload!')
      console.log('✅ PowerPoint with TTS download successful')
      
      setTimeout(() => {
        setIsGeneratingTTSPowerPoint(false)
        setTtsProgress('')
        setCurrentTTSSlide(0)
      }, 3000)

    } catch (error) {
      console.error('❌ PowerPoint TTS generation error:', error)
      setTtsProgress('Fout bij PowerPoint TTS generatie: ' + (error instanceof Error ? error.message : 'Onbekende fout'))
      setTimeout(() => {
        setIsGeneratingTTSPowerPoint(false)
        setTtsProgress('')
        setCurrentTTSSlide(0)
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
          Upload je PowerPoint, krijg een professioneel script, en download met notities en TTS audio
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

      {/* Slides with Scripts Preview */}
      {slides.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-gray-800">
              {scripts.length > 0 ? `Scripts per Slide (${slides.length})` : `Geëxtraheerde Slides (${slides.length})`}
            </h3>
            {scripts.length > 0 && (
              <div className="text-sm text-gray-600">
                💡 Klik op "Bewerken" om een script aan te passen
              </div>
            )}
          </div>
          
          <div className="grid gap-4 max-h-96 overflow-y-auto">
            {slides.map((slide, index) => (
              <div key={slide.slideNumber} className="slide-preview">
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-semibold text-gray-800 line-clamp-1">
                    Slide {slide.slideNumber}: {slide.title}
                  </h4>
                  {scripts.length > 0 && (
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-gray-500">
                        {scripts[index]?.split(' ').length || 0} woorden
                      </span>
                      <button
                        onClick={() => startEditingScript(index)}
                        className="px-3 py-1 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        ✏️ Bewerken
                      </button>
                    </div>
                  )}
                </div>
                
                {/* Show slide content only if no scripts generated yet */}
                {scripts.length === 0 && (
                  <p className="text-gray-600 text-sm line-clamp-3 mb-3">
                    {slide.content}
                  </p>
                )}
                
                {/* Show script if available */}
                {scripts.length > 0 && (
                  <div className="script-section">
                    {editingScriptIndex === index ? (
                      // Edit mode
                      <div className="space-y-3">
                        <h5 className="font-medium text-blue-800 mb-2">✏️ Script Bewerken:</h5>
                        <textarea
                          value={editingScriptText}
                          onChange={(e) => setEditingScriptText(e.target.value)}
                          className="w-full p-3 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                          rows={6}
                          placeholder="Bewerk het script voor deze slide..."
                        />
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={saveEditedScript}
                            className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                          >
                            ✅ Opslaan
                          </button>
                          <button
                            onClick={cancelEditingScript}
                            className="px-4 py-2 bg-gray-500 text-white text-sm rounded-lg hover:bg-gray-600 transition-colors"
                          >
                            ❌ Annuleren
                          </button>
                          <span className="text-xs text-gray-500 ml-auto">
                            {editingScriptText.split(' ').length} woorden
                          </span>
                        </div>
                      </div>
                    ) : (
                      // View mode
                      <div>
                        <h5 className="font-medium text-blue-800 mb-2">📝 Gegenereerd Script:</h5>
                        <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">
                          {scripts[index] || 'Geen script beschikbaar'}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Script Generation Settings */}
      {slides.length > 0 && scripts.length === 0 && (
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

      {/* TTS Settings for PowerPoint Generation */}
      {scripts.length > 0 && (
        <div className="mb-8 p-6 bg-purple-50 border border-purple-200 rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-purple-800">🎤 TTS Instellingen voor PowerPoint</h3>
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

      {/* PowerPoint Generation with TTS */}
      {scripts.length > 0 && (
        <div className="mb-8 p-6 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl">
          <h3 className="text-lg font-semibold text-indigo-800 mb-4">📊 Genereer PowerPoint met TTS Audio</h3>
          
          <div className="bg-white p-4 rounded-lg border border-indigo-200 mb-4">
            <div className="flex items-start space-x-3">
              <svg className="w-6 h-6 text-indigo-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <div>
                <h4 className="font-medium text-indigo-800 mb-2">PowerPoint Functionaliteiten:</h4>
                <ul className="text-sm text-indigo-700 space-y-1">
                  <li>• 📄 Alle originele slides behouden</li>
                  <li>• 📝 Scripts toegevoegd aan notities</li>
                  <li>• 🎙️ TTS audio gegenereerd met {useGeminiTTS ? `Gemini TTS (${selectedGeminiVoice.name})` : 'Microsoft TTS'}</li>
                  <li>• 🔊 Audio per slide afspelen tijdens presentatie</li>
                  <li>• 💾 Download als .pptx bestand</li>
                </ul>
              </div>
            </div>
          </div>

          {isGeneratingTTSPowerPoint && (
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center mb-2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-3"></div>
                <span className="text-blue-800 font-medium">PowerPoint met TTS wordt gegenereerd...</span>
              </div>
              <p className="text-blue-700 text-sm mb-2">{ttsProgress}</p>
              {currentTTSSlide > 0 && (
                <div className="w-full bg-blue-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(currentTTSSlide / slides.length) * 100}%` }}
                  ></div>
                </div>
              )}
            </div>
          )}

          <button
            onClick={generatePowerPointWithTTS}
            disabled={isGeneratingTTSPowerPoint || scripts.length === 0}
            className="w-full px-6 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGeneratingTTSPowerPoint ? (
              <span className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                PowerPoint met TTS wordt gegenereerd... ({currentTTSSlide}/{slides.length})
              </span>
            ) : (
              <span className="flex items-center justify-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                📊 Genereer PowerPoint met TTS Audio ({slides.length} slides)
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

          {/* Download with Notes (Basic) */}
          <button
            onClick={downloadWithNotes}
            disabled={isDownloading || !file}
            className="w-full px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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
                📥 Download PowerPoint met Script (Basis)
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  )
}