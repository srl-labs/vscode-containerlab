export class FilterUtils {
    /**
     * Creates a filter function that supports both regex and string matching
     * @param filterText The filter text (can be regex or plain string)
     * @returns A function that tests if a value matches the filter
     */
    static createFilter(filterText: string) {
        if (!filterText) {
            return () => true;
        }

        // Convert user-friendly patterns to regex
        const processedPattern = this.convertUserFriendlyPattern(filterText);

        try {
            const regex = new RegExp(processedPattern, 'i');
            return (value: string) => regex.test(value);
        } catch {
            // Invalid regex -> fall back simple string
            const searchText = filterText.toLowerCase();
            return (value: string) => value.toLowerCase().includes(searchText);
        }
    }

    /**
     * Convert user-friendly wildcard patterns to regex
     */
    private static convertUserFriendlyPattern(pattern: string): string {
        if (this.looksLikeRegex(pattern)) {
            return pattern;
        }
        const hasWildcards = /[*?#]/.test(pattern);

        let converted = pattern
            .replace(/\*/g, '.*')        // * becomes .*
            .replace(/\?/g, '.')         // ? becomes .
            .replace(/#/g, '\\d+');      // # becomes \d+ (for numbers)

        if (hasWildcards) {
            converted = `^${converted}$`;
        }

        return converted;
    }

    private static looksLikeRegex(pattern: string): boolean {
        return pattern.includes('\\') ||
               pattern.includes('[')  ||
               pattern.includes('(')  ||
               pattern.includes('|')  ||
               pattern.includes('^')  ||
               pattern.includes('$')  ||
               pattern.includes('.*') ||
               pattern.includes('.+');
    }
}
