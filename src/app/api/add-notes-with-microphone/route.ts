import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const slidesData = formData.get('slides') as string
    
    if (!file || !slidesData) {
      return NextResponse.json({ error: 'Bestand en slides data zijn vereist' }, { status: 400 })
    }

    const slides = JSON.parse(slidesData)
    
    // Read the original PowerPoint file
    const arrayBuffer = await file.arrayBuffer()
    const zip = new JSZip()
    const pptx = await zip.loadAsync(arrayBuffer)

    // Create media folder if it doesn't exist
    if (!pptx.files['ppt/media/']) {
      pptx.folder('ppt/media')
    }

    // Process audio files and add them to PowerPoint
    const audioFiles: { [key: string]: boolean } = {}
    
    for (let i = 0; i < slides.length; i++) {
      const audioFile = formData.get(`audio_${i}`) as File
      if (audioFile && audioFile.size > 0) {
        const audioBuffer = await audioFile.arrayBuffer()
        const audioFileName = `audio${i + 1}.wav`
        
        // Add audio file to PowerPoint media folder
        pptx.file(`ppt/media/${audioFileName}`, audioBuffer)
        audioFiles[`slide_${i + 1}`] = true
        
        console.log(`Added audio file: ${audioFileName} (${audioBuffer.byteLength} bytes)`)
      }
    }

    // Add notes to each slide (clean notes without microphone references)
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i]
      const slideNumber = i + 1
      const notesFileName = `ppt/notesSlides/notesSlide${slideNumber}.xml`
      const hasAudio = audioFiles[`slide_${slideNumber}`]
      
      // Create clean notes XML content
      const notesXml = createCleanNotesXml(slide.script || '', slideNumber, hasAudio)
      
      // Add or update the notes file
      pptx.file(notesFileName, notesXml)
      
      // Add audio trigger to slide if audio exists
      if (hasAudio) {
        await addAudioToSlide(pptx, slideNumber, `audio${slideNumber}.wav`)
      }
    }

    // Update content types
    await updateContentTypes(pptx)
    
    // Update relationships
    await updateRelationships(pptx, slides, audioFiles)

    // Generate the modified PowerPoint file
    const modifiedPptx = await pptx.generateAsync({ 
      type: 'arraybuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    })
    
    return new Response(modifiedPptx, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': 'attachment; filename="presentation_with_tts_audio.pptx"',
      },
    })

  } catch (error) {
    console.error('Error adding TTS audio:', error)
    return NextResponse.json(
      { error: 'Fout bij het toevoegen van TTS audio: ' + (error instanceof Error ? error.message : 'Onbekende fout') },
      { status: 500 }
    )
  }
}

// Create clean notes XML without microphone references
function createCleanNotesXml(scriptText: string, slideNumber: number, hasAudio: boolean): string {
  // Escape XML special characters
  const escapedScript = scriptText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

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
              <a:t>${escapedScript}</a:t>
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

// Add audio element to slide with proper PowerPoint audio controls
async function addAudioToSlide(pptx: JSZip, slideNumber: number, audioFileName: string) {
  const slideFileName = `ppt/slides/slide${slideNumber}.xml`
  const slideFile = pptx.files[slideFileName]
  
  if (!slideFile) {
    console.log(`Slide file not found: ${slideFileName}`)
    return
  }
  
  try {
    let slideXml = await slideFile.async('text')
    
    // Add audio shape with microphone icon to slide
    const audioShape = `
    <p:pic>
      <p:nvPicPr>
        <p:cNvPr id="${8000 + slideNumber}" name="Audio ${slideNumber}">
          <a:hlinkClick r:id="" action="ppaction://media"/>
        </p:cNvPr>
        <p:cNvPicPr>
          <a:picLocks noChangeAspect="1"/>
        </p:cNvPicPr>
        <p:nvPr>
          <a:audioFile r:embed="rId${7000 + slideNumber}"/>
          <a:extLst>
            <a:ext uri="{DAA4B4D4-6D71-4841-9C94-3DE7FCFB9230}">
              <p14:media xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" r:embed="rId${7000 + slideNumber}"/>
            </a:ext>
          </a:extLst>
        </p:nvPr>
      </p:nvPicPr>
      <p:blipFill>
        <a:blip r:embed="rId${6000 + slideNumber}"/>
        <a:stretch>
          <a:fillRect/>
        </a:stretch>
      </p:blipFill>
      <p:spPr>
        <a:xfrm>
          <a:off x="9144000" y="6858000"/>
          <a:ext cx="609600" cy="609600"/>
        </a:xfrm>
        <a:prstGeom prst="rect">
          <a:avLst/>
        </a:prstGeom>
        <a:solidFill>
          <a:srgbClr val="4472C4"/>
        </a:solidFill>
        <a:ln w="12700">
          <a:solidFill>
            <a:srgbClr val="FFFFFF"/>
          </a:solidFill>
        </a:ln>
      </p:spPr>
    </p:pic>`
    
    // Insert audio shape before closing spTree tag
    slideXml = slideXml.replace('</p:spTree>', audioShape + '\n    </p:spTree>')
    
    // Add timing for auto-play
    const timingXml = `
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
                        <p:cond evt="onBegin" delay="1000"/>
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
                                    <p:spTgt spid="${8000 + slideNumber}"/>
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
    if (!slideXml.includes('<p:timing>')) {
      slideXml = slideXml.replace('</p:sld>', timingXml + '\n</p:sld>')
    }
    
    // Update the slide file
    pptx.file(slideFileName, slideXml)
    
    console.log(`Added audio controls to slide ${slideNumber}`)
    
  } catch (error) {
    console.error(`Error adding audio to slide ${slideNumber}:`, error)
  }
}

// Update content types for audio files
async function updateContentTypes(pptx: JSZip) {
  const contentTypesFile = pptx.files['[Content_Types].xml']
  if (!contentTypesFile) return
  
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
  
  // Add image content type for audio icons
  if (!contentTypes.includes('image/png')) {
    contentTypes = contentTypes.replace(
      '</Types>',
      '  <Default Extension="png" ContentType="image/png"/>\n</Types>'
    )
  }
  
  pptx.file('[Content_Types].xml', contentTypes)
}

// Update relationships for slides and audio
async function updateRelationships(pptx: JSZip, slides: any[], audioFiles: { [key: string]: boolean }) {
  // Update main presentation relationships
  const relsFile = pptx.files['ppt/_rels/presentation.xml.rels']
  if (relsFile) {
    let rels = await relsFile.async('text')
    
    // Add relationships for notes slides
    for (let i = 0; i < slides.length; i++) {
      const slideNumber = i + 1
      const relId = `rId${1000 + slideNumber}`
      
      if (!rels.includes(`notesSlides/notesSlide${slideNumber}.xml`)) {
        rels = rels.replace(
          '</Relationships>',
          `  <Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="notesSlides/notesSlide${slideNumber}.xml"/>\n</Relationships>`
        )
      }
    }
    
    pptx.file('ppt/_rels/presentation.xml.rels', rels)
  }
  
  // Update slide relationships for audio
  for (let i = 0; i < slides.length; i++) {
    const slideNumber = i + 1
    if (!audioFiles[`slide_${slideNumber}`]) continue
    
    const slideRelsFile = pptx.files[`ppt/slides/_rels/slide${slideNumber}.xml.rels`]
    if (slideRelsFile) {
      let slideRels = await slideRelsFile.async('text')
      
      // Add audio relationship
      const audioRelId = `rId${7000 + slideNumber}`
      const iconRelId = `rId${6000 + slideNumber}`
      
      if (!slideRels.includes(`media/audio${slideNumber}.wav`)) {
        slideRels = slideRels.replace(
          '</Relationships>',
          `  <Relationship Id="${audioRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio" Target="../media/audio${slideNumber}.wav"/>\n</Relationships>`
        )
      }
      
      pptx.file(`ppt/slides/_rels/slide${slideNumber}.xml.rels`, slideRels)
    } else {
      // Create new relationships file for slide
      const newSlideRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId${7000 + slideNumber}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio" Target="../media/audio${slideNumber}.wav"/>
</Relationships>`
      
      pptx.file(`ppt/slides/_rels/slide${slideNumber}.xml.rels`, newSlideRels)
    }
  }
}