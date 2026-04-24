#!/usr/bin/env python3

with open('HomeScreen.js', 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

# Find and replace the main render navigation bar section
old_nav_section = '''          <TouchableOpacity style={styles.navBottomItem} onPress={() => navigation.navigate('Home')}>
            <Text style={styles.navBottomIcon}>'''

# Build the new section
new_nav_section = '''          <TouchableOpacity style={styles.navBottomItem} onPress={() => navigation.navigate('Home')}>
            <Image source={require('../assets/icons/home.png')} style={styles.navBottomIconImage} />'''

# Find all occurrences and replace smarter way
lines = content.split('\n')
result = []
i = 0
while i < len(lines):
    line = lines[i]
    
    # Check if we're at a navBottomIcon line for Home
    if "style={styles.navBottomIcon}" in line and i > 0 and "navigate('Home')" in lines[i-1]:
        # Skip this line (it's the bad icon)
        # Add the Image line instead
        indent = len(line) - len(line.lstrip())
        result.append(' ' * int(indent) + '<Image source={require(\'../assets/icons/home.png\')} style={styles.navBottomIconImage} />')
    else:
        result.append(line)
    i += 1

new_content = '\n'.join(result)

with open('HomeScreen.js', 'w', encoding='utf-8') as f:
    f.write(new_content)

print('✓ Fixed!')
