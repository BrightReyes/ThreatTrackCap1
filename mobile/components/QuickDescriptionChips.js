import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Quick Situational Tags Dictionary
 * 
 * Each crime type is mapped to two perspectives:
 * - 'victim': First-person statements ("I", "My")
 * - 'witness': Third-person statements ("I saw", "Someone")
 * 
 * Guidelines:
 * - No emojis
 * - Simple, plain English only
 * - Short button labels (< 3 words)
 * - Complete sentences for insertion to pass AI legitimacy checks (>= 10 chars)
 */
const QUICK_TAG_MAP = {
  robbery_holdup: {
    victim: [
      { label: 'Held at gunpoint', text: 'I was held at gunpoint' },
      { label: 'Held at knifepoint', text: 'The suspect threatened me with a knife' },
      { label: 'Took phone and bag', text: 'The suspect took my phone and bag' },
      { label: 'I am hurt', text: 'I am hurt and bleeding' },
      { label: 'I am hiding now', text: 'I am currently hiding in a safe place' },
    ],
    witness: [
      { label: 'Saw suspect with gun', text: 'I saw a suspect with a gun' },
      { label: 'Saw suspect with knife', text: 'I saw a suspect with a knife' },
      { label: 'Left on motorcycle', text: 'I saw the suspect escape on a motorcycle' },
      { label: 'Victim calling for help', text: 'The victim is calling for help' },
      { label: 'Suspect wearing mask', text: 'The suspect is wearing a black mask' },
    ],
  },
  theft_snatching: {
    victim: [
      { label: 'Phone snatched', text: 'My phone was snatched from my hand' },
      { label: 'Bag snatched', text: 'My bag was snatched from me' },
      { label: 'Two on motorcycle', text: 'Two people on a motorcycle took my item' },
      { label: 'Snatcher ran away', text: 'The snatcher ran away on foot' },
    ],
    witness: [
      { label: 'Saw phone snatched', text: 'I saw a phone snatched from someone' },
      { label: 'Saw bag snatched', text: 'I saw a bag get snatched' },
      { label: 'Two on motorcycle', text: 'I saw two people on a motorcycle do it' },
      { label: 'Snatcher ran away', text: 'I saw the snatcher run away on foot' },
    ],
  },
  physical_assault_injury: {
    victim: [
      { label: 'I was attacked', text: 'I was physically attacked' },
      { label: 'I am bleeding', text: 'I am bleeding and need an ambulance' },
      { label: 'Attacker still here', text: 'The person who attacked me is still here' },
      { label: 'Attacker had weapon', text: 'The attacker used a weapon on me' },
    ],
    witness: [
      { label: 'Saw people fighting', text: 'I saw people fighting in the street' },
      { label: 'Victim is on ground', text: 'The victim is lying on the ground hurt' },
      { label: 'Victim is bleeding', text: 'The victim is bleeding and needs an ambulance' },
      { label: 'Attacker still here', text: 'The attacker is still at the scene' },
    ],
  },
  traffic_accident: {
    victim: [
      { label: 'My vehicle was hit', text: 'My vehicle was hit in a crash' },
      { label: 'I am injured', text: 'I am injured in the crash' },
      { label: 'Driver ran away', text: 'The driver hit me and ran away' },
      { label: 'Need ambulance for me', text: 'I need an ambulance immediately' },
    ],
    witness: [
      { label: 'Saw car crash', text: 'I saw a road crash happen' },
      { label: 'Person hurt on road', text: 'A person is hurt on the road' },
      { label: 'Hit and run', text: 'I saw the driver do a hit and run' },
      { label: 'Road is blocked', text: 'The road is completely blocked' },
      { label: 'Need ambulance', text: 'We need an ambulance immediately' },
    ],
  },
  illegal_weapons: {
    victim: [
      { label: 'Pointed gun at me', text: 'A person pointed a gun at me' },
      { label: 'Threatened with knife', text: 'A person threatened me with a knife' },
      { label: 'I am hiding', text: 'I am hiding from an armed person' },
      { label: 'Need police rescue', text: 'I need police rescue right now' },
    ],
    witness: [
      { label: 'Saw person with gun', text: 'I saw a person carrying a gun' },
      { label: 'Saw person with knife', text: 'I saw a person carrying a knife' },
      { label: 'Gunshots heard', text: 'Gunshots were heard in the area' },
      { label: 'Threatening crowd', text: 'A person is threatening people with a weapon' },
    ],
  },
  domestic_violence: {
    victim: [
      { label: 'I am being hurt', text: 'I am being hurt inside the house' },
      { label: 'Need police rescue', text: 'I need police rescue right now' },
      { label: 'Children in danger', text: 'My children are inside and in danger' },
      { label: 'Attacker has weapon', text: 'The attacker inside has a weapon' },
    ],
    witness: [
      { label: 'Heard screams for help', text: 'I heard loud screams and fighting from the house' },
      { label: 'Someone is being hurt', text: 'Someone inside is in danger and being hurt' },
      { label: 'Need police check', text: 'Police are needed to check on the house' },
      { label: 'Crying heard inside', text: 'Children or family are crying for help inside' },
    ],
  },
  drug_related_activity: {
    victim: [
      { label: 'Threatened by users', text: 'I am being threatened by drug users' },
      { label: 'Outside my house', text: 'Drug activity is happening right outside my house' },
    ],
    witness: [
      { label: 'Saw selling drugs', text: 'I saw people selling illegal drugs' },
      { label: 'Saw using drugs', text: 'I saw people using illegal drugs in public' },
      { label: 'Happens here often', text: 'This illegal drug activity happens often here' },
    ],
  },
  public_disturbance: {
    victim: [
      { label: 'Drunk person bothering me', text: 'A drunk person is harassing me' },
      { label: 'Cannot leave area', text: 'I cannot leave because people are blocking the way' },
    ],
    witness: [
      { label: 'Drunk person trouble', text: 'A drunk person is causing trouble' },
      { label: 'Loud shouting', text: 'People are shouting and making trouble' },
      { label: 'Blocking the street', text: 'People are blocking the street' },
    ],
  },
  suspicious_activity: {
    victim: [
      { label: 'Someone following me', text: 'A stranger has been following me' },
      { label: 'Waiting outside gate', text: 'A stranger is waiting outside my gate' },
      { label: 'Looking into my house', text: 'Someone is looking inside my windows' },
    ],
    witness: [
      { label: 'Following someone', text: 'I saw a stranger following someone' },
      { label: 'Looking into cars', text: 'Someone is looking inside parked cars' },
      { label: 'Loitering by gates', text: 'A stranger is loitering around gates' },
    ],
  },
  vandalism_property_damage: {
    victim: [
      { label: 'My property broken', text: 'Someone broke my gate, window, or property' },
      { label: 'Rocks thrown at house', text: 'People are throwing rocks at my house' },
    ],
    witness: [
      { label: 'Saw property broken', text: 'I saw someone breaking property' },
      { label: 'Throwing rocks', text: 'People are throwing rocks at buildings' },
      { label: 'Broken gate or glass', text: 'A gate or window glass was broken' },
    ],
  },
  default: {
    victim: [
      { label: 'I need police now', text: 'I need police help right now' },
      { label: 'I am hurt', text: 'I am hurt and need an ambulance' },
      { label: 'Suspect near me', text: 'The suspect is still near me' },
      { label: 'I am in a safe place', text: 'I am currently in a safe place' },
    ],
    witness: [
      { label: 'Need police now', text: 'We need police right now' },
      { label: 'Someone is hurt', text: 'Someone is hurt and needs an ambulance' },
      { label: 'Suspect still here', text: 'The suspect is still nearby' },
      { label: 'Happening right now', text: 'This emergency is happening right now' },
    ],
  },
};

/**
 * Escape special regex characters in a string
 * Prevents regex errors when searching for phrases in text
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default function QuickDescriptionChips({
  incidentType,
  reportingAs,
  description = '',
  onDescriptionChange,
}) {
  // Normalize perspective: default to 'witness' if not specifically 'victim'
  const role = reportingAs === 'victim' ? 'victim' : 'witness';
  const categoryData = QUICK_TAG_MAP[incidentType] || QUICK_TAG_MAP.default;
  const tags = categoryData[role] || categoryData.witness || [];

  /**
   * Toggle tag insertion into the description:
   * - If already present: remove it cleanly
   * - If not present: append with clean sentence formatting
   */
  const handleToggleTag = (tag) => {
    const currentText = (description || '').trim();

    if (!currentText) {
      // First sentence: append a period
      onDescriptionChange(`${tag.text}.`);
      return;
    }

    // Check if phrase is already part of the description
    const isAlreadyPresent = currentText.toLowerCase().includes(tag.text.toLowerCase());

    if (isAlreadyPresent) {
      // Safely remove the phrase and any trailing or leading period/comma
      const escaped = escapeRegex(tag.text);
      const cleaned = currentText
        .replace(new RegExp(`(\\s*[,.]\\s*)?${escaped}\\.?`, 'gi'), '')
        .trim();
      onDescriptionChange(cleaned);
      return;
    }

    // Append with a period and space if previous text did not end in punctuation
    const endsWithPunctuation = /[.!?]$/.test(currentText);
    const separator = endsWithPunctuation ? ' ' : '. ';
    onDescriptionChange(`${currentText}${separator}${tag.text}.`);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Ionicons name="chatbubble-ellipses-outline" size={13} color="#2563eb" />
        <Text style={styles.headerLabel}>Quick details (tap to add):</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {tags.map((tag, idx) => {
          const isSelected = (description || '')
            .toLowerCase()
            .includes(tag.text.toLowerCase());

          return (
            <TouchableOpacity
              key={`${tag.label}-${idx}`}
              style={[styles.chip, isSelected && styles.chipSelected]}
              onPress={() => handleToggleTag(tag)}
              activeOpacity={0.7}
            >
              {isSelected && (
                <Ionicons name="checkmark" size={12} color="#1d4ed8" style={styles.checkIcon} />
              )}
              <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                {tag.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  headerLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4b5563',
  },
  scrollContent: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
    paddingRight: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1.2,
    borderColor: '#3b82f6',
    borderRadius: 16,
    paddingVertical: 4.5,
    paddingHorizontal: 10,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  chipSelected: {
    backgroundColor: '#eff6ff',
    borderColor: '#1d4ed8',
  },
  checkIcon: {
    marginRight: 3,
  },
  chipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#2563eb',
  },
  chipTextSelected: {
    color: '#1d4ed8',
    fontWeight: '800',
  },
});
