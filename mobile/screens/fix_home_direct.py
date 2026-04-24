#!/usr/bin/env python3

with open('HomeScreen.js', 'r', encoding='utf-8', errors='replace') as f:
    lines = f.readlines()

new_lines = []
i = 0
while i < len(lines):
    line = lines[i]
    
    # Check if this line contains navBottomIcon with any character
    if 'navBottomIcon' in line and '</Text>' in line:
        # Check if the next line contains the Home label
        if i + 1 < len(lines) and 'navBottomLabel}>Home' in lines[i + 1]:
            # Replace this icon line with Image component
            indent = len(line) - len(line.lstrip())
            new_lines.append(' ' * indent + '<Image source={require(\'../assets/icons/home.png\')} style={styles.navBottomIconImage} />\n')
            i += 1
            continue
    
    new_lines.append(line)
    i += 1

with open('HomeScreen.js', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print('HomeScreen updated!')
