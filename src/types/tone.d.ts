export interface ToneResult {
    document_tone: DocumentTone;
    sentences_tone: SentenceTone[];
}

export interface DocumentTone {
    tones: Tone[];
}

export interface Tone {
    score: number;
    tone_id: string;
    tone_name: string;
}

export interface SentenceTone {
    sentence_id: number;
    text: string;
    tones: Tone[];
}
