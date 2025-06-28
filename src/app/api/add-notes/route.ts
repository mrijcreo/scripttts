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

    // Add notes to each slide
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i]
      const slideNumber = i + 1
      const notesFileName = `ppt/notesSlides/notesSlide${slideNumber}.xml`
      
      // Create notes XML content
      const notesXml = createNotesXml(slide.script || '')
      
      // Add or update the notes file
      pptx.file(notesFileName, notesXml)
    }

    // Update content types if needed
    const contentTypesFile = pptx.files['[Content_Types].xml']
    if (contentTypesFile) {
      let contentTypes = await contentTypesFile.async('text')
      
      // Add notes slide content type if not present
      if (!contentTypes.includes('application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml')) {
        contentTypes = contentTypes.replace(
          '</Types>',
          '  <Default Extension="xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>\n</Types>'
        )
        pptx.file('[Content_Types].xml', contentTypes)
      }
    }

    // Update relationships
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
      }
      
      pptx.file('ppt/_rels/presentation.xml.rels', rels)
    }

    // Generate the modified PowerPoint file
    const modifiedPptx = await pptx.generateAsync({ type: 'arraybuffer' })
    
    return new Response(modifiedPptx, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': 'attachment; filename="presentation_with_notes.pptx"',
      },
    })

  } catch (error) {
    console.error('Error adding notes:', error)
    return NextResponse.json(
      { error: 'Fout bij het toevoegen van notities' },
      { status: 500 }
    )
  }
}

function createNotesXml(scriptText: string): string {
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