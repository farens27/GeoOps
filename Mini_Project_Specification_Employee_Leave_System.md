# Mini Project Specification

# Employee Leave Management System

## Overview

Build a monolithic web application using Next.js that allows employees and administrators to manage employee records and leave requests.

The application runs entirely in the browser and stores data using Local Storage.

No backend API and no database are required.

---

# Objectives

Participants will:

- Practice prompt engineering
- Use Amazon Q to generate code
- Apply project rules
- Perform AI-assisted code review
- Refactor AI-generated code

---

# Technology Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- ShadCN UI
- React Hook Form
- Zod
- Local Storage

---

# Authentication Module

## Login Page

URL:

```text
/login
```

Credentials:

```text
Username: admin
Password: admin123
```

Requirements:

- Validate username
- Validate password
- Store login session in localStorage
- Redirect to dashboard after login

---

# Dashboard Module

URL:

```text
/dashboard
```

Display:

- Total Employees
- Pending Leave Requests
- Approved Leave Requests
- Rejected Leave Requests

Requirements:

- Dashboard cards
- Responsive layout
- Real-time count from Local Storage

---

# Employee Management Module

## List Employees

URL:

```text
/employees
```

Features:

- View employees
- Search employees by name
- Delete employee
- Edit employee

---

## Create Employee

URL:

```text
/employees/new
```

Fields:

- Name
- Department
- Position

Validation:

- Required fields
- Minimum 3 characters for name

---

## Edit Employee

URL:

```text
/employees/edit/[id]
```

Requirements:

- Load existing data
- Update employee data
- Save to Local Storage

---

# Employee Data Model

```typescript
type Employee = {
  id: string;
  name: string;
  department: string;
  position: string;
};
```

---

# Leave Request Module

## List Leave Requests

URL:

```text
/leave
```

Features:

- View requests
- Filter by status
- Approve request
- Reject request

---

## Create Leave Request

URL:

```text
/leave/new
```

Fields:

- Employee
- Start Date
- End Date
- Reason

Validation:

- All fields required
- End Date must be greater than Start Date

---

# Leave Request Data Model

```typescript
type LeaveRequest = {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
};
```

---

# Navigation

```text
Dashboard
Employees
Leave Requests
Logout
```

---

# Suggested Folder Structure

```text
src/
├── app/
│   ├── login/
│   ├── dashboard/
│   ├── employees/
│   └── leave/
│
├── components/
│   ├── dashboard/
│   ├── employee/
│   ├── leave/
│   └── shared/
│
├── services/
│   ├── employee-storage.ts
│   └── leave-storage.ts
│
├── types/
├── validators/
├── hooks/
└── lib/
```

---

# Workshop Challenges

## Challenge 1

Generate:

- Folder structure
- Type definitions
- Validation schema

---

## Challenge 2

Generate:

- Login page
- Dashboard page
- Navigation menu

---

## Challenge 3

Generate:

- Employee CRUD
- Employee form
- Employee storage service

---

## Challenge 4

Generate:

- Leave Request CRUD
- Approval workflow
- Leave storage service

---

## Challenge 5

Perform Code Review

Find:

- 1 Security Issue
- 1 Performance Issue
- 1 Maintainability Issue

---

## Challenge 6

Refactor the project based on review findings.

---

# Acceptance Criteria

Application must:

- Run successfully using npm run dev
- Support employee CRUD
- Support leave request CRUD
- Support approve/reject workflow
- Store data in Local Storage
- Be responsive
- Follow project rules
