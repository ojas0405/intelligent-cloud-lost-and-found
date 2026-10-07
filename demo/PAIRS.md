# Three real demonstration pairs

These are input suggestions, not seeded database records or fabricated Rekognition outputs. Use your own photographs of each physical object. Scores depend on the actual labels returned by AWS. All dates below are examples; choose your demo date.

| Field | Bottle LOST | Bottle FOUND | Backpack LOST | Backpack FOUND | Earbuds LOST | Earbuds FOUND |
|---|---|---|---|---|---|---|
| Name | Black water bottle | Black water bottle | Navy backpack | Blue backpack | White earbuds | White earbuds case |
| Description | Black steel water bottle with blue star sticker | Black steel water bottle with blue star sticker | Navy backpack with laptop sleeve and silver zipper | Blue backpack with silver zipper | White wireless earbuds in oval case | White earbuds case near bench |
| Category | Bottle | Bottle | Bag | Bag | Electronics | Electronics |
| Color | Black | Black | Navy | Blue | White | White |
| Location | Library | CSE Block | Cafeteria | Cafeteria | Lab | Parking |
| Date | 2026-10-06 | 2026-10-06 | 2026-10-06 | 2026-10-07 | 2026-10-06 | 2026-10-06 |
| Time | 10:30 | 11:00 | 14:00 | 09:00 | 09:00 | 16:00 |
| Ownership question (LOST only) | What sticker is on the bottle? | — | What is inside the front pocket? | — | What initials are inside the case? | — |
| Hidden answer (LOST only) | blue star | — | red USB drive | — | AB | — |

With identical actual image labels, the bottle pair scores 97. The backpack pair loses points for color, description and time. Earbuds lose location, description and time points. Different Rekognition label sets change scores further. The threshold is 55 points by default. Identical photographs may make label overlap easier to demonstrate, but do not present that as proof of ownership.

Photograph the bottle, backpack and earbuds yourself. Report the LOST item first, wait for analysis, then report its FOUND partner. Do not submit all pairs at once during the first classroom demonstration.
