#!/usr/bin/env python3
import os
import re

screens = [
    'mobile/screens/HomeScreen.js',
    'mobile/screens/AlertsScreen.js',
    'mobile/screens/StatusScreen.js',
    'mobile/screens/SettingsScreen.js'
]

# Pattern to find Text element with any emoji/character and replace with Image
# This will work regardless of emoji encoding
pattern = r'<Text style=\{styles\.navBottomIcon\}>([^<]*)</Text>\s*\n\s*(<Text style=\{styles\.navBottomLabel\}>Home)'

replacement = r'<Image source={require(\'../assets/icons/home.png\')} style={styles.navBottomIconImage} />\n              \2'

for screen in screens:
    filepath = os.path.join(os.getcwd(), screen)
    
    if os.path.exists(filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Replace home icons (where the label is "Home")
        new_content = re.sub(
            r'<Text style=\{styles\.navBottomIcon\}>[^<]*</Text>\s*\n\s*<Text style=\{styles\.navBottomLabel\}>Home',
            '<Image source={require(\'../assets/icons/home.png\')} style={styles.navBottomIconImage} />\n              <Text style={styles.navBottomLabel}>Home',
            content
        )
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        
        print(f"Fixed {screen}")
    else:
        print(f"File not found: {screen}")

print("\nAll screens updated!")
