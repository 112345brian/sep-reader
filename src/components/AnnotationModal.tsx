import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Pressable,
} from 'react-native';
import type { Annotation } from '../types';

const COLORS = ['#FFE566', '#FF6B6B', '#66AAFF', '#66DD99'];

interface Props {
  annotation: Partial<Annotation> | null;
  onSave: (note: string | null, color: string) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export default function AnnotationModal({ annotation, onSave, onDelete, onClose }: Props) {
  const [note, setNote] = useState('');
  const [color, setColor] = useState('#FFE566');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (annotation) {
      setNote(annotation.note ?? '');
      setColor(annotation.color ?? '#FFE566');
    }
  }, [annotation]);

  if (!annotation) return null;

  const isNew = !annotation.id;

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' || Platform.OS === 'macos' ? 'padding' : undefined}
        style={styles.kav}
        pointerEvents="box-none"
      >
        <View style={styles.sheet}>
          {/* Selected text preview */}
          <View style={[styles.quoteBar, { borderLeftColor: color }]}>
            <Text style={styles.quoteText} numberOfLines={3}>
              "{annotation.selected_text}"
            </Text>
          </View>

          {/* Color picker */}
          <View style={styles.colorRow}>
            {COLORS.map(c => (
              <TouchableOpacity
                key={c}
                style={[styles.colorDot, { backgroundColor: c }, color === c && styles.colorDotSelected]}
                onPress={() => setColor(c)}
              />
            ))}
            <Text style={styles.colorLabel}>Highlight color</Text>
          </View>

          {/* Note input */}
          <TextInput
            ref={inputRef}
            style={styles.noteInput}
            placeholder="Add a note…"
            placeholderTextColor="#444"
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={2000}
            textAlignVertical="top"
          />

          {/* Actions */}
          <View style={styles.actions}>
            {!isNew && onDelete && (
              <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}>
                <Text style={styles.deleteBtnText}>Delete</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={() => onSave(note.trim() || null, color)}>
              <Text style={styles.saveBtnText}>{isNew ? 'Highlight' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  kav: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#3a3a3c',
  },
  quoteBar: {
    borderLeftWidth: 3,
    paddingLeft: 10,
    paddingVertical: 4,
  },
  quoteText: {
    color: '#888',
    fontSize: 14,
    lineHeight: 20,
    fontStyle: 'italic',
    fontFamily: Platform.OS === 'android' ? 'serif' : 'Georgia',
  },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  colorDot: {
    width: 24, height: 24, borderRadius: 12,
  },
  colorDotSelected: {
    borderWidth: 2.5,
    borderColor: '#fff',
  },
  colorLabel: {
    color: '#555',
    fontSize: 12,
    marginLeft: 4,
  },
  noteInput: {
    backgroundColor: '#2c2c2e',
    borderRadius: 10,
    padding: 12,
    color: '#e8e8e8',
    fontSize: 15,
    minHeight: 80,
    maxHeight: 160,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  deleteBtn: {
    paddingVertical: 10, paddingHorizontal: 14,
    marginRight: 'auto' as any,
  },
  deleteBtnText: { color: '#FF6B6B', fontSize: 15 },
  cancelBtn: {
    paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#2c2c2e',
  },
  cancelBtnText: { color: '#888', fontSize: 15 },
  saveBtn: {
    paddingVertical: 10, paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: '#7ba4ff',
  },
  saveBtnText: { color: '#0a0f1e', fontSize: 15, fontWeight: '600' },
});
