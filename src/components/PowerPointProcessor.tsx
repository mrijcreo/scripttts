'use client'

import { useState, useRef } from 'react'
import { saveAs } from 'file-saver'
import * as XLSX from 'xlsx'

interface Slide {
  slideNumber: number
  title: string
  content: string
  script?: string
}

interface ProcessingStatus {
  stage: 'idle' | 'extracting' | 'generating' | 'adding-notes' | 'complete'
  progress: number
  message: string
}

export default function PowerPointProcessor() {
  const [slides, setSlides] = useState<Slide[]>([])
  const [status, setStatus] = useState<ProcessingStatus>({
    stage: 'idle',
    progress: 0,
    message: ''
  })
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [generatedScript, setGeneratedScript] = useState<string>('')
  const [scriptStyle, setScriptStyle] = useState<'professional' | 'casual' | 'educational'>('educational') // Default to educational
  const [scriptLength, setScriptLength] = useState<'beknopt' | 'normaal' | 'uitgebreid'>('beknopt') // Default to beknopt
  
  // State for editing individual slides
  const [editingSlide, setEditingSlide] = useState<number | null>(null)
  const [editingScript, setEditingScript] = useState<string>('')
  const [regeneratingSlide, setRegeneratingSlide] = useState<number | null>(null)
  
  // State for tutoyeren functionality - default to true
  const [useTutoyeren, setUseTutoyeren] = useState(true) // Default to true
  const [isTutoyerenProcessing, setIsTutoyerenProcessing] = useState(false)
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pptx')) {
      alert('Alleen .pptx bestanden zijn toegestaan!')
      return
    }

    setUploadedFile(file)
    setStatus({
      stage: 'extracting',
      progress: 10,
      message: 'PowerPoint wordt geanalyseerd met AI...'
    })

    try {
      // Extract slides from PowerPoint with enhanced AI analysis
      const formData = new FormData()
      formData.append('file', file)

      console.log('🚀 Starting enhanced PowerPoint extraction...')

      const response = await fetch('/api/extract-slides', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Fout bij het extraheren van slides')
      }

      const data = await response.json()
      console.log('✅ Extraction successful:', data)
      
      if (!data.slides || data.slides.length === 0) {
        throw new Error('Geen slides gevonden in het PowerPoint bestand. Controleer of het bestand geldig is en tekstuele content bevat.')
      }

      setSlides(data.slides)
      
      setStatus({
        stage: 'extracting',
        progress: 50,
        message: `${data.slides.length} slides succesvol geanalyseerd! (${data.extractionMethod})`
      })

      // Auto-generate script with default settings
      await generateScript(data.slides)

    } catch (error) {
      console.error('❌ Upload error:', error)
      setStatus({
        stage: 'idle',
        progress: 0,
        message: 'Fout bij uploaden: ' + (error instanceof Error ? error.message : 'Onbekende fout')
      })
      
      // Show user-friendly error message
      alert(`Fout bij het verwerken van PowerPoint:\n\n${error instanceof Error ? error.message : 'Onbekende fout'}\n\nTips:\n- Controleer of het bestand een geldig .pptx bestand is\n- Zorg dat de slides tekstuele content bevatten\n- Probeer het bestand opnieuw op te slaan in PowerPoint`)
    }
  }

  const generateScript = async (slidesToProcess: Slide[] = slides) => {
    if (slidesToProcess.length === 0) return

    setStatus({
      stage: 'generating',
      progress: 60,
      message: 'Gemini 2.5 Pro genereert professioneel script...'
    })

    try {
      console.log('🤖 Generating script with Gemini 2.5 Pro...', {
        slides: slidesToProcess.length,
        style: scriptStyle,
        length: scriptLength,
        tutoyeren: useTutoyeren
      })

      const response = await fetch('/api/generate-script', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          slides: slidesToProcess,
          style: scriptStyle,
          length: scriptLength,
          useTutoyeren: useTutoyeren
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error('❌ API Error Response:', errorData)
        
        // Show user-friendly error message
        let errorMessage = 'Fout bij het genereren van script'
        if (errorData.error) {
          errorMessage = errorData.error
        }
        if (errorData.details) {
          errorMessage += ': ' + errorData.details
        }
        if (errorData.hint) {
          errorMessage += '\n\nTip: ' + errorData.hint
        }
        
        throw new Error(errorMessage)
      }

      const data = await response.json()
      console.log('✅ Script generation successful:', data.metadata)
      
      // Update slides with generated scripts
      const updatedSlides = slidesToProcess.map((slide, index) => ({
        ...slide,
        script: data.scripts[index] || ''
      }))
      
      setSlides(updatedSlides)
      
      // Create full script with proper paragraph breaks between slides
      const fullScript = updatedSlides.map((s, i) => 
        `=== SLIDE ${s.slideNumber}: ${s.title} ===\n\n${s.script}`
      ).join('\n\n\n') // Triple newline creates proper paragraph break
      
      setGeneratedScript(fullScript)
      
      setStatus({
        stage: 'complete',
        progress: 100,
        message: `Script succesvol gegenereerd! (${data.metadata?.style}, ${data.metadata?.length}${data.metadata?.useTutoyeren ? ', tutoyeren' : ''})`
      })

    } catch (error) {
      console.error('❌ Script generation error:', error)
      setStatus({
        stage: 'idle',
        progress: 0,
        message: 'Fout bij script generatie: ' + (error instanceof Error ? error.message : 'Onbekende fout')
      })
      
      // Show detailed error to user
      if (error instanceof Error) {
        alert(`Script generatie mislukt:\n\n${error.message}\n\nControleer je API configuratie en probeer opnieuw.`)
      }
    }
  }

  // Generate script for a single slide with specific length
  const regenerateSlideScript = async (slideIndex: number, newLength: 'beknopt' | 'normaal' | 'uitgebreid') => {
    const slide = slides[slideIndex]
    if (!slide) return

    setRegeneratingSlide(slideIndex)

    try {
      const response = await fetch('/api/generate-script', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          slides: [slide], // Only this slide
          style: scriptStyle,
          length: newLength,
          useTutoyeren: useTutoyeren
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Fout bij het regenereren van script')
      }

      const data = await response.json()
      
      // Update only this slide's script
      const updatedSlides = [...slides]
      updatedSlides[slideIndex] = {
        ...slide,
        script: data.scripts[0] || ''
      }
      
      setSlides(updatedSlides)
      
      // Update full script by regenerating it with proper paragraph breaks
      const fullScript = updatedSlides.map((s, i) => 
        `=== SLIDE ${s.slideNumber}: ${s.title} ===\n\n${s.script}`
      ).join('\n\n\n') // Triple newline creates proper paragraph break
      setGeneratedScript(fullScript)

    } catch (error) {
      console.error('Slide regeneration error:', error)
      alert('Fout bij het regenereren van script: ' + (error instanceof Error ? error.message : 'Onbekende fout'))
    } finally {
      setRegeneratingSlide(null)
    }
  }

  // Start editing a slide script
  const startEditingSlide = (slideIndex: number) => {
    const slide = slides[slideIndex]
    if (slide && slide.script) {
      setEditingSlide(slideIndex)
      setEditingScript(slide.script)
    }
  }

  // Save edited script
  const saveEditedScript = () => {
    if (editingSlide === null) return

    const updatedSlides = [...slides]
    updatedSlides[editingSlide] = {
      ...updatedSlides[editingSlide],
      script: editingScript
    }
    
    setSlides(updatedSlides)
    
    // Update full script with proper paragraph breaks
    const fullScript = updatedSlides.map((s, i) => 
      `=== SLIDE ${s.slideNumber}: ${s.title} ===\n\n${s.script}`
    ).join('\n\n\n') // Triple newline creates proper paragraph break
    setGeneratedScript(fullScript)
    
    // Close editor
    setEditingSlide(null)
    setEditingScript('')
  }

  // Cancel editing
  const cancelEditing = () => {
    setEditingSlide(null)
    setEditingScript('')
  }

  // Download script as .txt file
  const downloadScriptAsTxt = () => {
    if (!generatedScript) return

    const blob = new Blob([generatedScript], { type: 'text/plain;charset=utf-8' })
    const fileName = uploadedFile 
      ? uploadedFile.name.replace('.pptx', '_script.txt')
      : 'presentatie_script.txt'
    
    saveAs(blob, fileName)
  }

  // Download ONLY scripts as .xlsx file - each script on a new row WITHOUT slide column
  const downloadScriptAsExcel = () => {
    if (!slides.length) return

    // Create worksheet data - ONLY scripts (no slide column)
    const worksheetData = [
      // Header row
      ['Script']
    ]

    // Add script for each slide (one script per row)
    slides.forEach(slide => {
      worksheetData.push([
        slide.script || 'Geen script gegenereerd'
      ])
    })

    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData)

    // Set column widths - only one column now
    const columnWidths = [
      { wch: 120 } // Script (very wide for full script text)
    ]
    worksheet['!cols'] = columnWidths

    // Style the header row
    const headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "366092" } },
      alignment: { horizontal: "center", vertical: "center" }
    }

    // Apply header styling
    const headerCellAddress = XLSX.utils.encode_cell({ r: 0, c: 0 })
    if (!worksheet[headerCellAddress]) worksheet[headerCellAddress] = { v: '' }
    worksheet[headerCellAddress].s = headerStyle

    // Set text wrapping for script column
    for (let row = 1; row <= slides.length; row++) {
      const scriptCellAddress = XLSX.utils.encode_cell({ r: row, c: 0 })
      if (!worksheet[scriptCellAddress]) worksheet[scriptCellAddress] = { v: '' }
      worksheet[scriptCellAddress].s = {
        alignment: { 
          wrapText: true, 
          vertical: "top",
          horizontal: "left"
        }
      }
    }

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Scripts')

    // Generate filename
    const fileName = uploadedFile 
      ? uploadedFile.name.replace('.pptx', '_scripts.xlsx')
      : 'presentatie_scripts.xlsx'

    // Save file
    XLSX.writeFile(workbook, fileName)
  }

  // Function to convert script to tutoyeren form
  const convertToTutoyeren = async () => {
    if (!generatedScript || slides.length === 0) return

    setIsTutoyerenProcessing(true)

    try {
      const response = await fetch('/api/convert-tutoyeren', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          slides: slides
        }),
      })

      if (!response.ok) {
        throw new Error('Fout bij het converteren naar tutoyeren')
      }

      const data = await response.json()
      
      // Update slides with tutoyeren scripts
      const updatedSlides = slides.map((slide, index) => ({
        ...slide,
        script: data.scripts[index] || slide.script
      }))
      
      setSlides(updatedSlides)
      setGeneratedScript(data.fullScript)
      setUseTutoyeren(true)

    } catch (error) {
      console.error('Tutoyeren conversion error:', error)
      alert('Fout bij het converteren naar tutoyeren: ' + (error instanceof Error ? error.message : 'Onbekende fout'))
    } finally {
      setIsTutoyerenProcessing(false)
    }
  }

  const downloadWithNotes = async () => {
    if (!uploadedFile || slides.length === 0) return

    setStatus({
      stage: 'adding-notes',
      progress: 80,
      message: 'Notities worden toegevoegd aan PowerPoint...'
    })

    try {
      const formData = new FormData()
      formData.append('file', uploadedFile)
      formData.append('slides', JSON.stringify(slides))

      const response = await fetch('/api/add-notes', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Fout bij het toevoegen van notities')
      }

      const blob = await response.blob()
      const fileName = uploadedFile.name.replace('.pptx', '_met_script.pptx')
      
      saveAs(blob, fileName)
      
      setStatus({
        stage: 'complete',
        progress: 100,
        message: 'PowerPoint gedownload met script notities!'
      })

    } catch (error) {
      console.error('Download error:', error)
      setStatus({
        stage: 'idle',
        progress: 0,
        message: 'Fout bij downloaden: ' + (error instanceof Error ? error.message : 'Onbekende fout')
      })
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      handleFileUpload(files[0])
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const resetApp = () => {
    setSlides([])
    setUploadedFile(null)
    setGeneratedScript('')
    setEditingSlide(null)
    setEditingScript('')
    setRegeneratingSlide(null)
    setUseTutoyeren(true) // Reset to default true
    setIsTutoyerenProcessing(false)
    setStatus({
      stage: 'idle',
      progress: 0,
      message: ''
    })
  }

  // Function to go back to settings for regeneration
  const goBackToSettings = () => {
    // Keep the uploaded file and extracted slides, but reset to idle state
    // This allows user to change settings and regenerate
    setStatus({
      stage: 'idle',
      progress: 0,
      message: ''
    })
    setGeneratedScript('')
    setEditingSlide(null)
    setEditingScript('')
    setRegeneratingSlide(null)
    setUseTutoyeren(true) // Reset to default true
    setIsTutoyerenProcessing(false)
    // Clear scripts from slides but keep the slide content
    const slidesWithoutScripts = slides.map(slide => ({
      ...slide,
      script: undefined
    }))
    setSlides(slidesWithoutScripts)
  }

  // Helper function to get script length description
  const getScriptLengthDescription = (length: string) => {
    switch (length) {
      case 'beknopt':
        return 'Korte, bondige scripts (15-30 sec per slide)'
      case 'normaal':
        return 'Standaard scripts (30-45 sec per slide)'
      case 'uitgebreid':
        return 'Uitgebreide scripts (45-60 sec per slide)'
      default:
        return ''
    }
  }

  // Helper function to get script style description
  const getScriptStyleDescription = (style: string) => {
    switch (style) {
      case 'professional':
        return 'Zakelijk, formeel en overtuigend'
      case 'casual':
        return 'Informeel, toegankelijk en persoonlijk'
      case 'educational':
        return 'Educatief, duidelijk en leerzaam'
      default:
        return ''
    }
  }

  // Function to create visual slide preview
  const createSlidePreview = (slide: Slide) => {
    // Parse content to identify different elements
    const lines = slide.content.split(/[.\n]/).filter(line => line.trim().length > 0)
    const title = slide.title
    const bulletPoints = lines.slice(1, 6) // Take up to 5 bullet points
    
    return (
      <div className="bg-white border-2 border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow min-h-[300px] flex flex-col">
        {/* Slide Header */}
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 bg-blue-600 rounded text-white text-xs flex items-center justify-center font-bold">
              {slide.slideNumber}
            </div>
            <span className="text-xs text-gray-500 font-medium">SLIDE {slide.slideNumber}</span>
          </div>
          <div className="text-xs text-gray-400">
            {slide.content.split(' ').length} woorden
          </div>
        </div>

        {/* Slide Title */}
        <div className="mb-4">
          <h3 className="text-lg font-bold text-gray-800 leading-tight line-clamp-2">
            {title}
          </h3>
        </div>

        {/* Slide Content Preview */}
        <div className="flex-1 space-y-2">
          {bulletPoints.length > 0 ? (
            bulletPoints.map((point, idx) => (
              <div key={idx} className="flex items-start space-x-2">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                <p className="text-sm text-gray-600 leading-relaxed line-clamp-2">
                  {point.trim()}
                </p>
              </div>
            ))
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <svg className="w-8 h-8 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-xs">Geen tekst gevonden</p>
              </div>
            </div>
          )}
          
          {bulletPoints.length > 5 && (
            <div className="text-xs text-gray-400 italic pt-2 border-t border-gray-100">
              + {lines.length - 5} meer items...
            </div>
          )}
        </div>

        {/* Slide Footer */}
        <div className="mt-4 pt-2 border-t border-gray-100">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>PowerPoint Slide</span>
            <div className="flex items-center space-x-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span>Preview</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Upload Section - Show when idle OR when we have slides but want to regenerate */}
      {(status.stage === 'idle') && (
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">
            {uploadedFile ? 'Wijzig Instellingen & Regenereer Script' : 'Upload je PowerPoint Presentatie'}
          </h2>
          
          {/* Show current file info if we have one */}
          {uploadedFile && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-blue-800">Huidige presentatie:</p>
                  <p className="text-blue-600 text-sm">{uploadedFile.name}</p>
                  <p className="text-blue-500 text-xs">{slides.length} slides geëxtraheerd</p>
                </div>
              </div>
            </div>
          )}
          
          {/* Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Script Stijl
              </label>
              <select
                value={scriptStyle}
                onChange={(e) => setScriptStyle(e.target.value as any)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="professional">🎯 Professioneel</option>
                <option value="casual">😊 Informeel</option>
                <option value="educational">📚 Educatief</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {getScriptStyleDescription(scriptStyle)}
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Script Lengte
              </label>
              <select
                value={scriptLength}
                onChange={(e) => setScriptLength(e.target.value as any)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="beknopt">⚡ Beknopt</option>
                <option value="normaal">📝 Normaal</option>
                <option value="uitgebreid">📖 Uitgebreid</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {getScriptLengthDescription(scriptLength)}
              </p>
            </div>
          </div>

          {/* Tutoyeren Option - Always enabled by default */}
          <div className="mb-8">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="tutoyeren"
                  checked={useTutoyeren}
                  onChange={(e) => setUseTutoyeren(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="tutoyeren" className="flex items-center space-x-2 text-sm font-medium text-gray-700 cursor-pointer">
                  <span>👥 Tutoyeren (jij/jouw i.p.v. u/uw)</span>
                  <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">STANDAARD</span>
                </label>
              </div>
              <p className="text-xs text-gray-600 mt-2 ml-7">
                Gebruik informele aanspreekvorm in het script voor een persoonlijkere benadering
              </p>
            </div>
          </div>

          {/* Action buttons - different based on whether we have a file */}
          {uploadedFile && slides.length > 0 ? (
            // Regenerate mode
            <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4">
              <button
                onClick={() => generateScript(slides)}
                className="px-8 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-lg"
              >
                🔄 Regenereer Script met Nieuwe Instellingen
              </button>
              
              <button
                onClick={resetApp}
                className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                📁 Upload Andere Presentatie
              </button>
            </div>
          ) : (
            // Upload mode
            <div
              className={`border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200 ${
                isDragOver
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-blue-400'
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <div className="flex flex-col items-center space-y-4">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                
                <div>
                  <p className="text-xl font-medium text-gray-700">
                    Sleep je PowerPoint hier naartoe
                  </p>
                  <p className="text-gray-500 mt-2">
                    of klik om een bestand te selecteren
                  </p>
                  <p className="text-sm text-blue-600 mt-2 font-medium">
                    🤖 Powered by Gemini 2.5 Pro voor perfecte slide analyse
                  </p>
                </div>
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pptx"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleFileUpload(file)
                  }}
                  className="hidden"
                />
                
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Selecteer PowerPoint (.pptx)
                </button>
                
                <p className="text-sm text-gray-400">
                  Ondersteunt alleen .pptx bestanden • AI-powered extractie
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Processing Status */}
      {status.stage !== 'idle' && status.stage !== 'complete' && (
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center">
            <div className="loading-spinner mx-auto mb-4"></div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">
              {status.message}
            </h3>
            
            <div className="w-full bg-gray-200 rounded-full h-3 mb-4">
              <div 
                className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                style={{ width: `${status.progress}%` }}
              ></div>
            </div>
            <p className="text-gray-600">
              {status.progress}% voltooid
            </p>
          </div>
        </div>
      )}

      {/* Results */}
      {slides.length > 0 && status.stage === 'complete' && (
        <div className="space-y-6">
          {/* Action Buttons */}
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <div className="flex flex-col sm:flex-row items-center justify-between space-y-4 sm:space-y-0 sm:space-x-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-800">
                  Script Gegenereerd! 🎉
                </h3>
                <p className="text-gray-600">
                  {slides.length} slides verwerkt • {generatedScript.split(' ').length} woorden script
                </p>
                <p className="text-sm text-blue-600">
                  Stijl: {scriptStyle === 'professional' ? '🎯 Professioneel' : scriptStyle === 'casual' ? '😊 Informeel' : '📚 Educatief'} • 
                  Lengte: {scriptLength === 'beknopt' ? '⚡ Beknopt (15-30s)' : scriptLength === 'normaal' ? '📝 Normaal (30-45s)' : '📖 Uitgebreid (45-60s)'}
                  {useTutoyeren && ' • 👥 Tutoyeren'}
                </p>
              </div>
              
              <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3">
                <button
                  onClick={goBackToSettings}
                  className="px-4 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors font-medium"
                >
                  ⚙️ Wijzig Instellingen
                </button>
                
                <button
                  onClick={downloadWithNotes}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
                  📥 Download met Notities
                </button>
                
                <button
                  onClick={resetApp}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  🆕 Nieuwe Presentatie
                </button>
              </div>
            </div>
          </div>

          {/* Slides Preview */}
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <h3 className="text-2xl font-bold text-gray-800 mb-6">
              Slides met Gegenereerd Script
            </h3>
            
            <div className="space-y-8">
              {slides.map((slide, index) => (
                <div key={index} className="border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow">
                  {/* Slide Header */}
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="text-xl font-bold text-gray-800 flex items-center">
                      <span className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">
                        {slide.slideNumber}
                      </span>
                      Slide {slide.slideNumber}: {slide.title}
                    </h4>
                    <div className="flex items-center space-x-2 text-sm text-gray-500">
                      <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                        {slide.script?.split(' ').length || 0} woorden
                      </span>
                      <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                        {slide.content.split(' ').length} woorden inhoud
                      </span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                    {/* LEFT: Visual Slide Preview */}
                    <div>
                      <h5 className="font-semibold text-gray-700 mb-3 flex items-center">
                        <svg className="w-4 h-4 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        Slide Preview
                      </h5>
                      {createSlidePreview(slide)}
                    </div>
                    
                    {/* RIGHT: Script Section */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h5 className="font-semibold text-gray-700 flex items-center">
                          <svg className="w-4 h-4 mr-2 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                          </svg>
                          Gegenereerd Script
                        </h5>
                        
                        {/* Action buttons per slide */}
                        <div className="flex items-center space-x-2">
                          {/* Length adjustment dropdown */}
                          <div className="relative">
                            <select
                              onChange={(e) => {
                                const newLength = e.target.value as 'beknopt' | 'normaal' | 'uitgebreid'
                                if (newLength !== scriptLength) {
                                  regenerateSlideScript(index, newLength)
                                }
                              }}
                              disabled={regeneratingSlide === index}
                              className="text-xs px-3 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                              defaultValue={scriptLength}
                            >
                              <option value="beknopt">⚡ Beknopt (15-30s)</option>
                              <option value="normaal">📝 Normaal (30-45s)</option>
                              <option value="uitgebreid">📖 Uitgebreid (45-60s)</option>
                            </select>
                            {regeneratingSlide === index && (
                              <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 rounded-lg">
                                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                              </div>
                            )}
                          </div>
                          
                          {/* Edit button */}
                          <button
                            onClick={() => startEditingSlide(index)}
                            disabled={regeneratingSlide === index}
                            className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors disabled:opacity-50 text-xs font-medium"
                            title="Script handmatig bewerken"
                          >
                            ✏️ Bewerk
                          </button>
                        </div>
                      </div>
                      
                      {/* Script content or editor */}
                      {editingSlide === index ? (
                        // Edit mode
                        <div className="space-y-3">
                          <textarea
                            value={editingScript}
                            onChange={(e) => setEditingScript(e.target.value)}
                            className="w-full h-40 p-4 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Bewerk het script..."
                          />
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={saveEditedScript}
                                className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors font-medium"
                              >
                                ✅ Opslaan
                              </button>
                              <button
                                onClick={cancelEditing}
                                className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition-colors"
                              >
                                ❌ Annuleren
                              </button>
                            </div>
                            <span className="text-sm text-gray-500">
                              {editingScript.split(' ').length} woorden
                            </span>
                          </div>
                        </div>
                      ) : (
                        // View mode
                        <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-r-lg min-h-[200px]">
                          {regeneratingSlide === index ? (
                            <div className="flex items-center justify-center h-32">
                              <div className="flex items-center space-x-3 text-blue-600">
                                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                <span className="font-medium">Script wordt gegenereerd...</span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                              {slide.script || 'Script wordt gegenereerd...'}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Full Script */}
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-gray-800">
                Volledig Presentatie Script
              </h3>
              
              {/* Tutoyeren Button - only show if not already using tutoyeren */}
              {!useTutoyeren && (
                <button
                  onClick={convertToTutoyeren}
                  disabled={isTutoyerenProcessing}
                  className="px-4 py-2 bg-yellow-100 text-yellow-800 rounded-lg hover:bg-yellow-200 transition-colors font-medium flex items-center space-x-2 disabled:opacity-50"
                  title="Converteer naar tutoyeren (jij/jouw i.p.v. u/uw)"
                >
                  {isTutoyerenProcessing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-yellow-600 border-t-transparent rounded-full animate-spin"></div>
                      <span>Converteren...</span>
                    </>
                  ) : (
                    <>
                      <span>👥</span>
                      <span>Tutoyeren</span>
                    </>
                  )}
                </button>
              )}
            </div>
            
            <div className="bg-gray-50 p-6 rounded-lg">
              <div className="prose max-w-none">
                <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
                  {generatedScript}
                </div>
              </div>
            </div>
            
            {/* Download Buttons Section */}
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-between space-y-4 sm:space-y-0 sm:space-x-4">
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(generatedScript)
                    alert('Script gekopieerd naar klembord!')
                  }}
                  className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                >
                  📋 Kopieer Script
                </button>
              </div>
              
              {/* Download Buttons */}
              <div className="flex items-center space-x-3">
                <button
                  onClick={downloadScriptAsTxt}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center space-x-2"
                  title="Download script als tekstbestand"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>📄 Download .txt</span>
                </button>
                
                <button
                  onClick={downloadScriptAsExcel}
                  className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium flex items-center space-x-2"
                  title="Download alleen scripts als Excel bestand - elk script op een nieuwe rij"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>📊 Scripts .xlsx</span>
                </button>
              </div>
            </div>
            
            {/* Download Info */}
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start space-x-3">
                <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">Download Opties:</p>
                  <ul className="space-y-1 text-blue-700">
                    <li><strong>📄 .txt bestand:</strong> Volledig script als platte tekst voor eenvoudig gebruik</li>
                    <li><strong>📊 Scripts .xlsx:</strong> Alleen de scripts in Excel formaat - elk script op een aparte rij</li>
                    <li><strong>📥 PowerPoint met notities:</strong> Originele PowerPoint met scripts toegevoegd als notities</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}