import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextRequest, NextResponse } from 'next/server'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

export async function POST(request: NextRequest) {
  try {
    // Check if API key is configured
    if (!process.env.GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY not found in environment variables')
      return NextResponse.json(
        { 
          error: 'GEMINI_API_KEY niet geconfigureerd',
          details: 'Voeg GEMINI_API_KEY toe aan je .env.local bestand',
          hint: 'Herstart de development server na het toevoegen van de API key'
        },
        { status: 500 }
      )
    }

    // Validate API key format
    if (!process.env.GEMINI_API_KEY.startsWith('AIza')) {
      console.error('Invalid GEMINI_API_KEY format')
      return NextResponse.json(
        { 
          error: 'Ongeldige GEMINI_API_KEY format',
          details: 'De API key moet beginnen met "AIza"',
          hint: 'Controleer je API key in Google AI Studio'
        },
        { status: 500 }
      )
    }

    const { slides, style, length, useTutoyeren } = await request.json()

    if (!slides || slides.length === 0) {
      return NextResponse.json({ 
        error: 'Geen slides ontvangen',
        details: 'Er zijn geen slides gevonden om een script voor te genereren'
      }, { status: 400 })
    }

    // Test API connectivity first
    console.log('Testing Gemini API connectivity...')
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }) // Use more stable model

    // Updated length-specific settings
    const lengthSettings: Record<string, { timePerSlide: string; wordCount: string; description: string }> = {
      beknopt: {
        timePerSlide: '15-30 seconden',
        wordCount: '40-80 woorden',
        description: 'zeer korte, bondige scripts'
      },
      normaal: {
        timePerSlide: '30-45 seconden',
        wordCount: '80-120 woorden',
        description: 'standaard scripts'
      },
      uitgebreid: {
        timePerSlide: '45-60 seconden',
        wordCount: '120-180 woorden',
        description: 'uitgebreide, gedetailleerde scripts'
      }
    }

    // Style-specific prompts
    const stylePrompts: Record<string, string> = {
      professional: "Schrijf een professioneel, zakelijk presentatiescript. Gebruik formele taal, duidelijke structuur en overtuigende argumenten.",
      casual: "Schrijf een informeel, toegankelijk presentatiescript. Gebruik een vriendelijke toon, spreektaal en maak het persoonlijk.",
      educational: "Schrijf een educatief presentatiescript. Leg concepten duidelijk uit, gebruik voorbeelden en zorg voor goede leerdoelen."
    }

    const currentLength = lengthSettings[length]

    // Tutoyeren instruction
    const tutoyerenInstruction = useTutoyeren 
      ? "BELANGRIJK: Gebruik ALTIJD de informele aanspreekvorm 'jij/jouw/je' in plaats van 'u/uw'. Spreek het publiek direct en persoonlijk aan."
      : "Gebruik de formele aanspreekvorm 'u/uw' waar gepast."

    const prompt = `
Je bent een expert presentatiescriptschrijver. Genereer een professioneel script voor een PowerPoint presentatie.

STIJL: ${stylePrompts[style]}

SCRIPT LENGTE: ${length.toUpperCase()}
- Tijd per slide: ${currentLength.timePerSlide}
- Woordenaantal per slide: ${currentLength.wordCount}
- Type: ${currentLength.description}

AANSPREEKVORM: ${tutoyerenInstruction}

SPECIFICATIES:
- Aantal slides: ${slides.length}
- Taal: Nederlands
- Maak het script natuurlijk en spreekbaar

SLIDES INHOUD:
${slides.map((slide: any, index: number) => `
Slide ${slide.slideNumber}: ${slide.title}
Inhoud: ${slide.content}
`).join('\n')}

INSTRUCTIES:
1. Genereer voor elke slide een apart script van ${currentLength.wordCount}
2. Zorg voor vloeiende overgangen tussen slides
3. Begin met een sterke opening en eindig met een krachtige conclusie
4. Maak het script natuurlijk en spreekbaar
5. Voeg waar nodig pauzes en ademruimte toe
6. Gebruik de ${style} stijl consequent
7. Houd rekening met de ${length} lengte-instelling
8. ${tutoyerenInstruction}

${length === 'beknopt' ? 'BELANGRIJK: Houd het zeer kort en krachtig. Ga direct to the point. Maximaal 80 woorden per slide.' : ''}
${length === 'normaal' ? 'BELANGRIJK: Geef voldoende detail maar blijf gefocust. Ongeveer 80-120 woorden per slide.' : ''}
${length === 'uitgebreid' ? 'BELANGRIJK: Geef uitgebreide uitleg, voorbeelden en context. Ongeveer 120-180 woorden per slide.' : ''}

FORMAAT:
Geef het resultaat in deze structuur:

SLIDE 1 SCRIPT:
[Script voor slide 1]

SLIDE 2 SCRIPT:
[Script voor slide 2]

[etc. voor alle slides]

VOLLEDIG SCRIPT:
[Het complete script als één doorlopende tekst]
`

    console.log('Generating script with Gemini API...')
    
    // Add timeout and retry logic
    const generateWithRetry = async (retries = 3): Promise<any> => {
      for (let i = 0; i < retries; i++) {
        try {
          console.log(`Attempt ${i + 1}/${retries} to generate content...`)
          
          // Create a timeout promise
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Request timeout after 30 seconds')), 30000)
          })
          
          // Race between the API call and timeout
          const result = await Promise.race([
            model.generateContent(prompt),
            timeoutPromise
          ])
          
          return result
        } catch (error) {
          console.error(`Attempt ${i + 1} failed:`, error)
          
          if (i === retries - 1) {
            throw error
          }
          
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000))
        }
      }
    }

    const result = await generateWithRetry()
    const response = await result.response
    const scriptText = response.text()

    // Parse the response to extract individual slide scripts
    const slideScripts: string[] = []
    const slideMatches = scriptText.match(/SLIDE \d+ SCRIPT:\s*([\s\S]*?)(?=SLIDE \d+ SCRIPT:|VOLLEDIG SCRIPT:|$)/g)
    
    if (slideMatches) {
      slideMatches.forEach(match => {
        const script = match.replace(/SLIDE \d+ SCRIPT:\s*/, '').trim()
        slideScripts.push(script)
      })
    }

    // Extract full script
    const fullScriptMatch = scriptText.match(/VOLLEDIG SCRIPT:\s*([\s\S]*)$/)
    const fullScript = fullScriptMatch ? fullScriptMatch[1].trim() : scriptText

    // Ensure we have scripts for all slides
    while (slideScripts.length < slides.length) {
      slideScripts.push(`Script voor slide ${slideScripts.length + 1} wordt gegenereerd...`)
    }

    console.log('Script generation successful')
    return NextResponse.json({
      success: true,
      scripts: slideScripts,
      fullScript: fullScript,
      metadata: {
        totalSlides: slides.length,
        style: style,
        length: length,
        useTutoyeren: useTutoyeren,
        estimatedTimePerSlide: currentLength.timePerSlide,
        wordsPerSlide: slideScripts.map(script => script.split(' ').length)
      }
    })

  } catch (error) {
    console.error('Script generation error:', error)
    
    // Enhanced error handling with specific error types
    if (error instanceof Error) {
      // Network/connectivity errors
      if (error.message.includes('fetch failed') || 
          error.message.includes('network') || 
          error.message.includes('ENOTFOUND') ||
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('timeout')) {
        return NextResponse.json(
          { 
            error: 'Netwerkverbinding probleem',
            details: 'Kan geen verbinding maken met Gemini API. Controleer je internetverbinding.',
            hint: 'Probeer het opnieuw. Als het probleem aanhoudt, controleer je firewall instellingen.',
            technicalError: error.message
          },
          { status: 503 }
        )
      }
      
      // API key errors
      if (error.message.includes('API key') || error.message.includes('401') || error.message.includes('403')) {
        return NextResponse.json(
          { 
            error: 'API key probleem',
            details: 'Je Gemini API key is ongeldig of heeft geen toegang.',
            hint: 'Controleer je GEMINI_API_KEY in .env.local en herstart de server.',
            technicalError: error.message
          },
          { status: 401 }
        )
      }
      
      // Quota/rate limit errors
      if (error.message.includes('quota') || 
          error.message.includes('limit') || 
          error.message.includes('429') ||
          error.message.includes('RESOURCE_EXHAUSTED')) {
        return NextResponse.json(
          { 
            error: 'API quota bereikt',
            details: 'Je hebt je Gemini API limiet bereikt voor vandaag.',
            hint: 'Wacht tot morgen of upgrade je Gemini API plan in Google AI Studio.',
            technicalError: error.message
          },
          { status: 429 }
        )
      }
      
      // Model errors
      if (error.message.includes('model') || error.message.includes('404')) {
        return NextResponse.json(
          { 
            error: 'Model niet beschikbaar',
            details: 'Het Gemini model is tijdelijk niet beschikbaar.',
            hint: 'Probeer het over een paar minuten opnieuw.',
            technicalError: error.message
          },
          { status: 503 }
        )
      }
      
      // Content policy errors
      if (error.message.includes('SAFETY') || error.message.includes('blocked')) {
        return NextResponse.json(
          { 
            error: 'Inhoud geblokkeerd',
            details: 'De slide inhoud werd geblokkeerd door veiligheidsfilters.',
            hint: 'Controleer je slide inhoud op mogelijk problematische tekst.',
            technicalError: error.message
          },
          { status: 400 }
        )
      }
    }
    
    // Generic error fallback
    return NextResponse.json(
      { 
        error: 'Onbekende fout bij script generatie',
        details: 'Er is een onverwachte fout opgetreden.',
        hint: 'Probeer het opnieuw. Als het probleem aanhoudt, controleer je API configuratie.',
        technicalError: error instanceof Error ? error.message : 'Onbekende fout'
      },
      { status: 500 }
    )
  }
}