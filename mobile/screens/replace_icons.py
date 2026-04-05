import re

with open('HomeScreen.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace home icon (Text) with Image component everywhere
# Pattern: any Text element with navBottomIcon style inside Home button, regardless of emoji
content = re.sub(
    r'(<TouchableOpacity style=\{styles\.navBottomItem\} onPress=\(\(\) => navigation\.navigate\(\'Home\'\)\)>\s*\n\s*)<Text style=\{styles\.navBottomIcon\}>[^<]*</Text>',
    r'\1<Image source={require(\'../assets/icons/home.png\')} style={styles.navBottomIconImage} />',
    content
)

# Replace report icon Text with Image
content = re.sub(
    r'<Text style=\{styles\.reportButtonWireIcon\}>[^<]*</Text>',
    r'<Image source={require(\'../assets/icons/report.png\')} style={styles.reportButtonWireIcon} />',
    content
)

with open('HomeScreen.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Icons replaced successfully!")
