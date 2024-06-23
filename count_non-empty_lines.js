function countNonEmptyNonCommentLines(code, language) {
    // Define comment patterns for different languages
    const commentPatterns = {
        'python': /^\s*#/,
        'js': /^\s*\/\//,
        'html': /^\s*<!--.*?-->/,
        'cpp': /^\s*\/\//,
        'rust': /^\s*\/\//
    };

    // Select the appropriate comment pattern
    const pattern = commentPatterns[language.toLowerCase()];
    if (!pattern) {
        throw new Error(`Unsupported language: ${language}`);
    }

    // Count non-empty, non-comment lines
    return code.split('\n').reduce((count, line) => {
        if (line.trim() && !pattern.test(line.trim())) {
            count++;
        }
        return count;
    }, 0);
}

// Example usage
const codeSnippet = `
def hello_world():
    print("Hello, world!")  # This is a comment

# Another comment
hello_world()
`;

console.log(countNonEmptyNonCommentLines(codeSnippet, 'python'));  // Output: 3