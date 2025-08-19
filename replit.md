# Overview

This is a basketball-themed grid puzzle game application built with React and Express. The application allows users to upload player data files (CSV, JSON, or gzipped files) and then play a 3x3 grid game where they must find players who match specific row and column criteria. The game is similar to "Immaculate Grid" style sports trivia games, where players must identify athletes who satisfy intersecting conditions (like teams played for, achievements, years active, etc.). The application has been optimized to support BBGM (Basketball GM) league files, including compressed formats for easier file handling.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **React with TypeScript**: Single-page application built with Vite as the build tool
- **Routing**: Uses Wouter for lightweight client-side routing
- **State Management**: React Query (@tanstack/react-query) for server state management and caching
- **UI Components**: Shadcn/ui component library built on Radix UI primitives with Tailwind CSS for styling
- **Form Handling**: React Hook Form with Zod validation for type-safe form management

## Backend Architecture
- **Express.js Server**: RESTful API server with TypeScript
- **File Upload**: Multer middleware for handling CSV/JSON file uploads
- **Data Parsing**: CSV-parser for processing CSV files, with support for both CSV and JSON player data formats
- **Storage Layer**: Abstracted storage interface with in-memory implementation (MemStorage class)
- **API Structure**: RESTful endpoints for players, games, and game sessions

## Database Design
- **Drizzle ORM**: Type-safe database access layer with PostgreSQL dialect
- **Schema Design**: 
  - Players table with JSONB fields for teams, years, achievements, and stats
  - Games table storing column/row criteria and correct answers
  - Game sessions table tracking player answers and scores
- **Data Types**: Heavy use of JSONB for flexible, structured data storage

## Development Setup
- **Monorepo Structure**: Shared types and schemas between client and server in `/shared` directory
- **Hot Reload**: Vite development server with HMR for frontend, tsx for backend development
- **Build Process**: Vite for frontend bundling, esbuild for backend compilation

# External Dependencies

## Database
- **Neon Database**: Serverless PostgreSQL database (@neondatabase/serverless)
- **Drizzle Kit**: Database migration and schema management tool

## UI Framework
- **Radix UI**: Comprehensive primitive component library for accessible UI components
- **Tailwind CSS**: Utility-first CSS framework for styling
- **Lucide React**: Icon library for consistent iconography

## File Processing
- **Multer**: Express middleware for handling multipart/form-data file uploads
- **CSV Parser**: Library for parsing CSV files into JavaScript objects
- **Zlib**: Built-in Node.js library for gzip compression/decompression support
- **BBGM Support**: Optimized for Basketball GM league file formats including compressed files

## Development Tools
- **Replit Integration**: Development environment optimizations and runtime error handling
- **TypeScript**: Static type checking across the entire application
- **PostCSS**: CSS processing with Tailwind and Autoprefixer plugins

## State Management
- **React Query**: Server state management, caching, and synchronization
- **React Hook Form**: Form state management with validation
- **Zod**: Runtime type validation and schema definition