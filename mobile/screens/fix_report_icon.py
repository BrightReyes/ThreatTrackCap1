#!/usr/bin/env python3

with open('HomeScreen.js', 'r', encoding='utf-8', errors='replace') as f:
    lines = f.readlines()

# Find all lines with the Reports icon (📊) and replace with Image component
replacements = 0
new_lines = []
for i, line in enumerate(lines):
    # Look for the chart emoji icon for Reports
    if 'navBottomIcon' in line and '📊' in line:
        # Replace with Image component - maintain indentation
        indent = len(line) - len(line.lstrip())
        new_lines.append(' ' * indent + "<Image source={require('../assets/icons/report.png')} style={styles.navBottomIconImage} />\n")
        replacements += 1
        print(f"Replacing Reports icon on line {i+1}")
    else:
        new_lines.append(line)

with open('HomeScreen.js', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print(f'✓ Done! Replaced {replacements} Reports icons with report.png')
