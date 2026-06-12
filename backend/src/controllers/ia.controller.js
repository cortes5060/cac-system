const Anthropic = require('@anthropic-ai/sdk');

const generarTexto = async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: 'El prompt es requerido' });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'API key no configurada. Agrega ANTHROPIC_API_KEY en el archivo .env' });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      thinking: { type: 'adaptive' },
      messages: [
        {
          role: 'user',
          content: `Eres un asistente especializado para analistas del Centro de Atención al Cliente (CAC) de INSEPET. Tu rol es ayudar a redactar tickets de soporte técnico de forma clara, estructurada y profesional. Responde siempre en español.\n\n${prompt}`
        }
      ]
    });

    const textBlock = message.content.find(b => b.type === 'text');
    res.json({ resultado: textBlock?.text || '' });

  } catch (error) {
    console.error('Error IA:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = { generarTexto };
