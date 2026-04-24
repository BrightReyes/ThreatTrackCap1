#!/usr/bin/env python3
import re

with open('HomeScreen.js', 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

# Replace the broken home icon with Image component in main render section
# Look for pattern: <Text style={styles.navBottomIcon}>[any char]</Text> followed by Home label
pattern1 = r'<Text style=\{styles\.navBottomIcon\}>[^<]*</Text>\s*<Text style=\{styles\.navBottomLabel\}>Home</Text>'
replacement1 = '<Image source={require(\'../assets/icons/home.png\')} style={styles.navBottomIconImage} />\n            <Text style={styles.navBottomLabel}>Home</Text>'

content = re.sub(pattern1, replacement1, content)

# Also replace in the loading state
pattern2 = r'(<Text style=\{styles\.navBottomIcon\}>[^<]*</Text>\s*<Text style=\{styles\.navBottomLabel\}>Home</Text>)'
content = re.sub(pattern2, replacement1, content)

with open('HomeScreen.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('✓ HomeScreen home icons fixed!')
