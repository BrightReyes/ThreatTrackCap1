#!/usr/bin/env python3
import re

# Read the file
with open('HomeScreen.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Pattern to find: <Text style={styles.navBottomIcon}>🏠</Text>
# Replace with: <Image source={require('../assets/icons/home.png')} style={styles.navBottomIconImage} />

# Try multiple patterns to handle encoding issues
patterns = [
    # Try direct emoji match
    (r'<Text style=\{styles\.navBottomIcon\}>🏠</Text>', '<Image source={require(\'../assets/icons/home.png\')} style={styles.navBottomIconImage} />'),
    # Try with any single character (in case encoding is messed up)
    (r'<Text style=\{styles\.navBottomIcon\}>.</Text>\s*<Text style=\{styles\.navBottomLabel\}>Home</Text>', '<Image source={require(\'../assets/icons/home.png\')} style={styles.navBottomIconImage} />\n              <Text style={styles.navBottomLabel}>Home</Text>'),
]

original = content
for pattern, replacement in patterns:
    content = re.sub(pattern, replacement, content)

if content != original:
    # Write the file back
    with open('HomeScreen.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("✓ File updated successfully")
else:
    print("✗ No replacements made - patterns may not match")
    # Print diagnostic info
    if '🏠' in content:
        print("Found house emoji")
    if 'navBottomIcon' in content:
        print("Found navBottomIcon style")
