// services/aiService.js
const axios = require('axios');

class AIService {
  constructor() {
    this.openai = axios.create({
      baseURL: 'https://api.openai.com/v1',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
  }

  async generateQuestions(category, difficulty = 'medium', count = 10) {
    const prompt = this.buildPrompt(category, difficulty, count);
    
    try {
      const response = await this.openai.post('/chat/completions', {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 2000
      });

      const questions = this.parseAIResponse(response.data.choices[0].message.content);
      return this.validateQuestions(questions);
    } catch (error) {
      throw new Error(`AI question generation failed: ${error.message}`);
    }
  }

  buildPrompt(category, difficulty, count) {
    return `
      Generate ${count} ${difficulty} difficulty multiple-choice questions about ${category}.
      Each question should have 4 options (A, B, C, D) and one correct answer.
      
      Format your response as a JSON array:
      [
        {
          "question": "Question text?",
          "options": ["Option A", "Option B", "Option C", "Option D"],
          "correctAnswer": "A",
          "explanation": "Brief explanation of correct answer",
          "points": 10
        }
      ]
      
      Ensure questions are factually accurate and cover diverse topics within ${category}.
      Points should be based on difficulty: easy=5, medium=10, hard=15.
    `;
  }

  parseAIResponse(content) {
    try {
      // Extract JSON from AI response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('Invalid AI response format');
    } catch (error) {
      throw new Error(`Failed to parse AI response: ${error.message}`);
    }
  }

  validateQuestions(questions) {
    return questions.map(q => ({
      ...q,
      id: require('crypto').randomBytes(8).toString('hex'),
      createdAt: new Date()
    }));
  }
}

module.exports = new AIService();