#!/usr/bin/env python3

# Read file in binary mode
with open('HomeScreen.js', 'rb') as f:
    content = f.read()

# Find occurrences of 'navBottomIcon'> and replace the following broken emoji
# with the Image component

# Pattern: <Text style={styles.navBottomIcon}>[broken-char]</Text>
# We'll search for the pattern and replace it

import re

# Convert to string but with error handling
content_str = content.decode('utf-8', errors='replace')

# Find the pattern - anything between > and <
pattern = r'<Text style=\{styles\.navBottomIcon\}>[^<]*</Text>(\s*<Text style=\{styles\.navBottomLabel\}>Home</Text>)'

def replacement_func(match):
    preserved_whitespace = match.group(1)
    return f'<Image source={{require(\'../assets/icons/home.png\')}} style={{styles.navBottomIconImage}} />{preserved_whitespace}'

new_content = re.sub(pattern, replacement_func, content_str)

# Write back
with open('HomeScreen.js', 'w', encoding='utf-8') as f:
    f.write(new_content)

print('Done - replaced home icons')
count = len(re.findall(pattern, content_str))
print(f'Found and replaced {count} occurrences')
