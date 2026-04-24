#!/usr/bin/env python3

# Read the file in bytes to understand the actual content
with open('HomeScreen.js', 'rb') as f:
    content_bytes = f.read()

# Find all occurrences of navBottomIcon and navBottomLabel together
import re
content_str = content_bytes.decode('utf-8', errors='replace')

# Look for the pattern with "Home" label to replace the icon above it
# <TouchableOpacity ... Home ... </TouchableOpacity>
pattern = r'<TouchableOpacity style=\{styles\.navBottomItem\} onPress=\(\(\) => navigation\.navigate\([\'"]Home["\']\)\)>\s*<Text style=\{styles\.navBottomIcon\}>[^<]*</Text>'

# Check if pattern matches
matches = re.findall(pattern, content_str)
print(f"Found {len(matches)} matches")
if matches:
    for i, match in enumerate(matches):
        print(f"Match {i+1}: {match[:50]}...")

# Do the replacement
new_content = re.sub(
    pattern,
    '<TouchableOpacity style={styles.navBottomItem} onPress={() => navigation.navigate("Home")}>\n              <Image source={require("../assets/icons/home.png")} style={styles.navBottomIconImage} />',
    content_str
)

if new_content != content_str:
    with open('HomeScreen.js', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("✓ File updated!")
else:
    print("✗ No changes made")
