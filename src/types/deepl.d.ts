export interface Deepl {
    translations: DeeplTranslation[];
}

export interface DeeplTranslation {
    detected_source_language: string;
    text: string;
}
