#!/usr/bin/env python3

with open('HomeScreen.js', 'r', encoding='utf-8', errors='replace') as f:
    lines = f.readlines()

# Replace lines 422 and 676 which have the broken character
new_lines = []
for i, line in enumerate(lines):
    if (i == 421 or i == 675) and 'navBottomIcon' in line:
        # Replace with Image component - maintain indentation
        indent = len(line) - len(line.lstrip())
        new_lines.append(' ' * indent + "<Image source={require('../assets/icons/home.png')} style={styles.navBottomIconImage} />\n")
    else:
        new_lines.append(line)

with open('HomeScreen.js', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print('✓ HomeScreen fixed! Replaced 2 broken home icons with Image components')
