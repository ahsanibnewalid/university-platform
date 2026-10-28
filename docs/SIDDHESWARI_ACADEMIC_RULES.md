# Siddheswari College academic integration policy

This repository targets **Siddheswari College, Dhaka**, including National University of Bangladesh-affiliated higher education. It is not the university's official admission, examination, or result system.

## Program boundaries

| Local program type | Academic authority | Key data and controls |
| --- | --- | --- |
| HSC | Applicable Bangladesh higher-secondary board and college rules | HSC year/group, board registration, board examination and HSC grading must be maintained separately |
| HONOURS | National University, Bangladesh | NU academic session, registration number, college/department, program year, published result and university grading policy |
| DEGREE | National University, Bangladesh | Degree-pass session, registration, year, and relevant NU result rules |
| PROFESSIONAL_HONOURS | National University when approved for the exact program | Separate admission/registration and grading policy; do not infer it from regular honours |
| MASTERS | National University, Bangladesh | Masters session, subject, NU registration/examination and results |

The Prisma model already differentiates `ProgramType`, `AcademicSession`, `StudentAcademicEnrollment`, `GradePoint` and `TranscriptResult`. Configure actual program catalogues and grade policies with approved institutional data. Never invent student registration numbers or grade boundaries.

## Required before going live

1. Confirm the authorized program list, department codes, official college identity, academic-calendar rules and admissions channels with college administration.
2. Provide HSC board affiliation data and its separate official regulations.
3. Provide current NU academic sessions, registration formats, exam policies and approved grading thresholds; validate them with NU materials.
4. Reconcile fees against approved college schedules. Do not collect real payments against unapproved fee structures.
5. Require verified guardian relationships; audit access to minor and student records.
6. Test role boundaries, duplicate registration, session transfers, attendance and result publication, backups and recovery against a disposable database.
7. Get explicit institutional authorization before claiming this app is an official Siddheswari College system.

Official reference services:
- College: https://scd.edu.bd/
- National University: https://www.nu.ac.bd/
- NU admissions: https://app11.nu.edu.bd/
- NU results: https://result.nu.ac.bd/

No external result or admission service is scraped or impersonated by this repository.
