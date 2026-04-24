#!/usr/bin/env python3

files_to_update = [
    ('StatusScreen.js', 'StatusScreen'),
    ('AlertsScreen.js', 'AlertsScreen'),
    ('SettingsScreen.js', 'SettingsScreen'),
]

for filename, module_name in files_to_update:
    with open(filename, 'r', encoding='utf-8', errors='replace') as f:
        lines = f.readlines()
    
    replacements = 0
    new_lines = []
    for i, line in enumerate(lines):
        # Look for the chart emoji icon for Reports
        if 'navBottomIcon' in line and '📊' in line:
            # Replace with Image component - maintain indentation
            indent = len(line) - len(line.lstrip())
            new_lines.append(' ' * indent + "<Image source={require('../assets/icons/report.png')} style={styles.navBottomIconImage} />\n")
            replacements += 1
            print(f"{module_name}: Replacing Reports icon on line {i+1}")
        else:
            new_lines.append(line)
    
    with open(filename, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    
    print(f"  ✓ {module_name}: {replacements} icon(s) replaced\n")

print('✅ All modules updated! Reports icons now use report.png')
