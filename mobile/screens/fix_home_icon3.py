#!/usr/bin/env python3
# Fix HomeScreen emoji to image icons in navigation bar

with open('HomeScreen.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find and replace lines with home emoji icon
new_lines = []
i = 0
while i < len(lines):
    line = lines[i]
    
    # Check if this is a navBottomIcon line with home emoji
    if 'navBottomIcon' in line and 'Home' in lines[i+2] if i+2 < len(lines) else False:
        # Check the next few lines for context
        if i > 0 and 'navigate' in lines[i-1] and 'Home' in lines[i-1]:
            # This is the home icon - replace it with image
            new_lines.append('              <Image source={require(\'../assets/icons/home.png\')} style={styles.navBottomIconImage} />\n')
            i += 1
            continue
    
    new_lines.append(line)
    i += 1

# Write back
with open('HomeScreen.js', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print('Done!')
