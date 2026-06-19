/**
 * The CLOSED node taxonomy (DESIGN.md §3.1): exactly nine built-in node TYPES.
 * This frozen tuple is the lock — the enumerated, testable form of the "small,
 * closed set" guarantee. Adding a tenth name is an intentional, reviewed spec
 * change, not an accident.
 *
 * Most names map to an exported scene-node class from the base index
 * (Group/Rect/Circle/Path/Text/Image/Video/Custom). 'Layout' is the lone
 * exception: the Layout node lives in the separately-budgeted './layout' entry
 * (§3.2, Yoga), so the NAME is in the taxonomy but the class is not pulled into
 * the base index — keeping the base scene bundle free of Yoga.
 */
export const NODE_TAXONOMY = [
  'Group',
  'Rect',
  'Circle',
  'Path',
  'Text',
  'Image',
  'Video',
  'Layout',
  'Custom',
] as const;

/** The name of one of the nine taxonomy node types (§3.1). */
export type NodeTypeName = (typeof NODE_TAXONOMY)[number];
