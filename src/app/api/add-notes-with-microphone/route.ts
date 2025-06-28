import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const slidesData = formData.get('slides') as string
    const ttsMode = formData.get('ttsMode') as string
    
    if (!file || !slidesData) {
      return NextResponse.json({ error: 'Bestand en slides data zijn vereist' }, { status: 400 })
    }

    const slides = JSON.parse(slidesData)
    
    // Read the original PowerPoint file
    const arrayBuffer = await file.arrayBuffer()
    const zip = new JSZip()
    const pptx = await zip.loadAsync(arrayBuffer)

    // Process audio files and create microphone controls
    const audioFiles: { [key: string]: ArrayBuffer } = {}
    
    for (let i = 0; i < slides.length; i++) {
      const audioFile = formData.get(`audio_${i}`) as File
      if (audioFile && audioFile.size > 0) {
        const audioBuffer = await audioFile.arrayBuffer()
        audioFiles[`slide_${i + 1}_audio.wav`] = audioBuffer
        
        // Add audio file to PowerPoint media folder
        pptx.file(`ppt/media/slide_${i + 1}_audio.wav`, audioBuffer)
      }
    }

    // Add notes with microphone controls to each slide
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i]
      const slideNumber = i + 1
      const notesFileName = `ppt/notesSlides/notesSlide${slideNumber}.xml`
      const hasAudio = audioFiles[`slide_${slideNumber}_audio.wav`]
      
      // Create enhanced notes XML content with microphone control
      const notesXml = createNotesWithMicrophoneXml(slide.script || '', slideNumber, hasAudio)
      
      // Add or update the notes file
      pptx.file(notesFileName, notesXml)
      
      // If audio exists, add slide-level audio trigger
      if (hasAudio) {
        await addAudioTriggerToSlide(pptx, slideNumber, `slide_${slideNumber}_audio.wav`)
      }
    }

    // Update content types for audio and microphone controls
    const contentTypesFile = pptx.files['[Content_Types].xml']
    if (contentTypesFile) {
      let contentTypes = await contentTypesFile.async('text')
      
      // Add notes slide content type if not present
      if (!contentTypes.includes('application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml')) {
        contentTypes = contentTypes.replace(
          '</Types>',
          '  <Default Extension="xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>\n</Types>'
        )
      }
      
      // Add audio content types
      if (!contentTypes.includes('audio/wav')) {
        contentTypes = contentTypes.replace(
          '</Types>',
          '  <Default Extension="wav" ContentType="audio/wav"/>\n</Types>'
        )
      }
      
      pptx.file('[Content_Types].xml', contentTypes)
    }

    // Update relationships for notes slides and audio
    const relsFile = pptx.files['ppt/_rels/presentation.xml.rels']
    if (relsFile) {
      let rels = await relsFile.async('text')
      
      // Add relationships for notes slides
      for (let i = 0; i < slides.length; i++) {
        const slideNumber = i + 1
        const relId = `rId${1000 + slideNumber}` // Use high IDs to avoid conflicts
        
        if (!rels.includes(`notesSlides/notesSlide${slideNumber}.xml`)) {
          rels = rels.replace(
            '</Relationships>',
            `  <Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="notesSlides/notesSlide${slideNumber}.xml"/>\n</Relationships>`
          )
        }
        
        // Add audio relationships if audio exists
        if (audioFiles[`slide_${slideNumber}_audio.wav`]) {
          const audioRelId = `rId${2000 + slideNumber}`
          if (!rels.includes(`media/slide_${slideNumber}_audio.wav`)) {
            rels = rels.replace(
              '</Relationships>',
              `  <Relationship Id="${audioRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio" Target="media/slide_${slideNumber}_audio.wav"/>\n</Relationships>`
            )
          }
        }
      }
      
      pptx.file('ppt/_rels/presentation.xml.rels', rels)
    }

    // Generate the modified PowerPoint file with microphone controls
    const modifiedPptx = await pptx.generateAsync({ type: 'arraybuffer' })
    
    return new Response(modifiedPptx, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': 'attachment; filename="presentation_with_tts_microphone.pptx"',
      },
    })

  } catch (error) {
    console.error('Error adding microphone controls:', error)
    return NextResponse.json(
      { error: 'Fout bij het toevoegen van TTS microfoon functionaliteit' },
      { status: 500 }
    )
  }
}

// Create notes XML with microphone control and auto-play functionality
function createNotesWithMicrophoneXml(scriptText: string, slideNumber: number, hasAudio: boolean): string {
  // Escape XML special characters
  const escapedScript = scriptText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

  // Create microphone control section
  const microphoneControl = hasAudio ? `

🎤 AUDIO BESCHIKBAAR - Klik op microfoon icoon om af te spelen

SCRIPT VOOR AUTOMATISCHE VOORLEZING:
${escapedScript}

⚡ Deze audio wordt automatisch afgespeeld tijdens de presentatie
🔊 Gebruik de microfoon knop voor handmatige bediening` : `

📝 SCRIPT VOOR VOORLEZING:
${escapedScript}

💡 Lees dit script voor tijdens de presentatie`

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="2" name="Slide Image Placeholder 1"/>
          <p:cNvSpPr>
            <a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/>
          </p:cNvSpPr>
          <p:nvPr>
            <p:ph type="sldImg"/>
          </p:nvPr>
        </p:nvSpPr>
        <p:spPr/>
      </p:sp>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="3" name="Notes Placeholder 2"/>
          <p:cNvSpPr>
            <a:spLocks noGrp="1"/>
          </p:cNvSpPr>
          <p:nvPr>
            <p:ph type="body" idx="1"/>
          </p:nvPr>
        </p:nvSpPr>
        <p:spPr/>
        <p:txBody>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p>
            <a:r>
              <a:rPr lang="nl-NL" dirty="0"/>
              <a:t>${microphoneControl}</a:t>
            </a:r>
          </a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr>
    <a:masterClrMapping/>
  </p:clrMapOvr>
</p:notes>`
}

// Add audio trigger to slide for automatic playback (like PowerPoint recording)
async function addAudioTriggerToSlide(pptx: JSZip, slideNumber: number, audioFileName: string) {
  const slideFileName = `ppt/slides/slide${slideNumber}.xml`
  const slideFile = pptx.files[slideFileName]
  
  if (!slideFile) return
  
  try {
    let slideXml = await slideFile.async('text')
    
    // Add audio control shape (microphone icon) to slide
    const audioControlShape = `
    <p:sp>
      <p:nvSpPr>
        <p:cNvPr id="${9000 + slideNumber}" name="Audio Control ${slideNumber}"/>
        <p:cNvSpPr/>
        <p:nvPr>
          <p:ph type="obj" sz="quarter" idx="10"/>
        </p:nvPr>
      </p:nvSpPr>
      <p:spPr>
        <a:xfrm>
          <a:off x="9144000" y="6858000"/>
          <a:ext cx="457200" cy="457200"/>
        </a:xfrm>
        <a:prstGeom prst="ellipse">
          <a:avLst/>
        </a:prstGeom>
        <a:solidFill>
          <a:srgbClr val="4472C4"/>
        </a:solidFill>
      </p:spPr>
      <p:txBody>
        <a:bodyPr/>
        <a:lstStyle/>
        <a:p>
          <a:r>
            <a:rPr lang="nl-NL" sz="1800" b="1">
              <a:solidFill>
                <a:srgbClr val="FFFFFF"/>
              </a:solidFill>
            </a:rPr>
            <a:t>🎤</a:t>
          </a:r>
        </a:p>
      </p:txBody>
    </p:sp>`
    
    // Insert audio control before closing spTree tag
    slideXml = slideXml.replace('</p:spTree>', audioControlShape + '\n    </p:spTree>')
    
    // Add timing and animation for auto-play
    const timingSection = `
  <p:timing>
    <p:tnLst>
      <p:par>
        <p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot">
          <p:childTnLst>
            <p:seq concurrent="1" nextAc="seek">
              <p:cTn id="2" dur="indefinite" nodeType="mainSeq">
                <p:childTnLst>
                  <p:par>
                    <p:cTn id="3" fill="hold">
                      <p:stCondLst>
                        <p:cond evt="onBegin" delay="500"/>
                      </p:stCondLst>
                      <p:childTnLst>
                        <p:par>
                          <p:cTn id="4" fill="hold">
                            <p:childTnLst>
                              <p:audio>
                                <p:cMediaNode vol="80000">
                                  <p:cTn id="5" fill="hold" dur="indefinite">
                                    <p:stCondLst>
                                      <p:cond evt="onBegin" delay="0"/>
                                    </p:stCondLst>
                                  </p:cTn>
                                  <p:tgtEl>
                                    <p:spTgt spid="${9000 + slideNumber}"/>
                                  </p:tgtEl>
                                </p:cMediaNode>
                              </p:audio>
                            </p:childTnLst>
                          </p:cTn>
                        </p:par>
                      </p:childTnLst>
                    </p:cTn>
                  </p:par>
                </p:childTnLst>
              </p:cTn>
            </p:seq>
          </p:childTnLst>
        </p:cTn>
      </p:par>
    </p:tnLst>
  </p:timing>`
    
    // Add timing section before closing slide tag
    slideXml = slideXml.replace('</p:sld>', timingSection + '\n</p:sld>')
    
    // Update the slide file
    pptx.file(slideFileName, slideXml)
    
  } catch (error) {
    console.error(`Error adding audio trigger to slide ${slideNumber}:`, error)
  }
}