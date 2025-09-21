/**
 * Splits a long string into chunks of maximum specified length,
 * preferring to break on sentence boundaries or spaces instead of cutting words in half.
 *
 * @param text - The text to split into chunks
 * @param maxLength - Maximum character length per chunk (default: 2000)
 * @returns Array of text chunks
 */
export function splitTextIntoChunks(
  text: string,
  maxLength: number = 2000
): string[] {
  if (!text || text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let currentText = text.trim();

  while (currentText.length > maxLength) {
    let chunkEnd = maxLength;
    let chunk = currentText.substring(0, chunkEnd);

    // Try to find a sentence boundary first (. ! ?)
    const sentenceMatch = chunk.match(/^(.*[.!?])\s*/);
    if (sentenceMatch && sentenceMatch[1].length > maxLength * 0.5) {
      // Good sentence break found (at least 50% of max length)
      chunk = sentenceMatch[1];
      chunkEnd = chunk.length;
    } else {
      // No good sentence break, try to find a space
      const lastSpaceIndex = chunk.lastIndexOf(" ");
      if (lastSpaceIndex > maxLength * 0.5) {
        // Good space break found (at least 50% of max length)
        chunkEnd = lastSpaceIndex;
        chunk = currentText.substring(0, chunkEnd);
      }
      // If no good space break, we'll cut at maxLength (word break)
    }

    // Add the chunk and remove it from current text
    chunks.push(chunk.trim());
    currentText = currentText.substring(chunkEnd).trim();
  }

  // Add remaining text if any
  if (currentText.length > 0) {
    chunks.push(currentText);
  }

  return chunks.filter((chunk) => chunk.length > 0);
}

/**
 * Estimates the total duration for multiple text chunks when synthesized to speech.
 * Uses approximate reading speed of 150 words per minute.
 *
 * @param chunks - Array of text chunks
 * @returns Estimated duration in milliseconds
 */
export function estimateSpeechDuration(chunks: string[]): number {
  const totalWords = chunks.reduce((count, chunk) => {
    return count + chunk.split(/\s+/).length;
  }, 0);

  // Assume 150 words per minute average reading speed
  const wordsPerMinute = 150;
  const estimatedMinutes = totalWords / wordsPerMinute;

  return Math.ceil(estimatedMinutes * 60 * 1000); // Convert to milliseconds
}
