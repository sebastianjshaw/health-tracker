# Health Tracker

This project is a comprehensive health tracking application built with React and TypeScript. It allows users to log their daily activities, monitor their health metrics, and visualize their progress over time.

## Features

- User registration and authentication
- Daily activity logging (steps, calories, water intake)
- Health metric tracking (weight, blood pressure, heart rate)
- Data visualization with charts
- Responsive design for all devices
- Secure API integration

## Technology Stack

- **Frontend**: React, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express, MongoDB
- **Authentication**: JWT
- **Charts**: Chart.js
- **State Management**: Context API

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher) or yarn
- MongoDB

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/health-tracker.git
   ```

2. Install dependencies:
   ```bash
   cd health-tracker
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file in the root directory with the following:
   ```
   REACT_APP_API_URL=http://localhost:5000/api
   REACT_APP_JWT_SECRET=your-jwt-secret-key
   ```

4. Start the development server:
   ```bash
   npm start
   ```

## Project Structure

```
health-tracker/
├── client/          # React frontend
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Page components
│   │   ├── services/       # API services
│   │   ├── utils/          # Utility functions
│   │   └── App.tsx         # Main application component
│   └── package.json
├── server/          # Node.js backend
│   ├── controllers/        # Request handlers
│   ├── models/             # Mongoose models
│   ├── routes/             # API routes
│   ├── middleware/         # Custom middleware
│   └── server.js           # Main server file
└── README.md
```

## Development

### Frontend

The frontend is built with React and TypeScript. Key components include:
- Dashboard for overview
- Activity logging forms
- Health metrics charts
- User profile management

### Backend

The backend follows RESTful principles and provides:
- User authentication endpoints
- Data storage for health metrics
- API for retrieving charts data

## Testing

Unit tests are written using Jest and React Testing Library for the frontend, and Mocha/Chai for the backend.

## Deployment

To deploy this application, you'll need to set up both frontend and backend servers. The project is structured to be easily deployable to platforms like Vercel, Netlify, or Heroku.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a pull request

## License

This project is licensed under the MIT License.