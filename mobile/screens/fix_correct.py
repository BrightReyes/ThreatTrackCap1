#!/usr/bin/env python3

with open('HomeScreen.js', 'r', encoding='utf-8', errors='replace') as f:
    lines = f.readlines()

# Replace lines 423 and 677 (1-indexed) = 422 and 676 (0-indexed)
new_lines = []
for i, line in enumerate(lines):
    if (i == 422 or i == 676) and 'navBottomIcon' in line and '<Text' in line:
        # Replace with Image component - maintain indentation
        indent = len(line) - len(line.lstrip())
        new_lines.append(' ' * indent + "<Image source={require('../assets/icons/home.png')} style={styles.navBottomIconImage} />\n")
        print(f"Replacing line {i+1}")
    else:
        new_lines.append(line)

with open('HomeScreen.js', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print('Done!')
