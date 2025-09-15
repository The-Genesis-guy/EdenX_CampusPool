# 🎓 CampusPool - Campus Ride Sharing Platform

> Share rides, save money, build community

CampusPool is a community-focused bike-sharing platform designed specifically for college students. Unlike commercial ride-hailing apps, CampusPool emphasizes cost-sharing, environmental responsibility, and building meaningful connections within the campus community.

## 🎯 Problem Statement

College students face multiple transportation challenges:

- **High Transportation Costs**: Individual bike rides and auto-rickshaws are expensive for students
- **Limited Campus Connectivity**: Poor public transport connections between hostels, campus, and popular destinations
- **Environmental Impact**: Multiple individual vehicles contribute to campus pollution and traffic
- **Social Isolation**: Limited opportunities to connect with fellow students during commutes
- **Safety Concerns**: Students traveling alone, especially during late hours
- **Parking Issues**: Overcrowded parking areas and difficulty finding space

## 💡 Our Solution

CampusPool creates a **community-driven bike-sharing ecosystem** that transforms campus transportation:

### Core Philosophy
- **Cost-Sharing, Not Profit**: Split fuel costs fairly among riders instead of commercial pricing
- **Community Building**: Connect students through shared journeys
- **Safety Through Verification**: College email verification ensures a trusted community
- **Environmental Responsibility**: Reduce campus carbon footprint through shared mobility

### Key Differentiators
- **Campus-Centric**: Tailored for college environments with campus-specific features
- **Real-Time Matching**: Smart algorithm matches riders based on location, route, and compatibility
- **Community Verification**: College email domain verification for safety

## 🚀 User Flow

### For (Students needing rides)
```
1. Registration → Email Verification → Profile Setup
2. Set Pickup Location (Current/Home/Custom)
3. Choose Destination (College/Popular Spots/Custom)
4. View Available Bike Riders on Live Map
5. Select Best Match (Based on Route, Rating, Cost)
6. Send Ride Request with Personal Message
7. Wait for Driver Acceptance (Real-time notifications)
8. Share OTP with Driver to Start Journey
9. Live Tracking During Ride
10. Complete Journey & Rate Experience
```

### For (Students offering rides)
```
1. Registration → Email Verification → Bike Profile Setup
2. Go Online & Set Route (Starting Point → Destination)
3. Set Available Seats & Departure Time
4. Receive Ride Requests from Community
5. Review Requester Profile & Route Compatibility
6. Accept/Decline Requests
7. Verify Rider Identity via OTP
8. Complete Journey & Rate Experience
9. Track Community Impact (CO₂ saved, connections made)
```

## 🛠️ Technologies Used

### Backend Stack
- **Python Flask**: Web framework for API development
- **MongoDB**: NoSQL database for scalable data storage
- **PyMongo**: MongoDB driver for Python
- **Flask-CORS**: Cross-origin resource sharing
- **Flask-Bcrypt**: Password hashing and security
- **PyJWT**: JSON Web Token authentication
- **Google Maps API**: Geocoding, places, and directions

### Frontend Stack
- **HTML5**: Semantic markup
- **CSS3**: Modern styling with custom properties and grid/flexbox
- **Vanilla JavaScript**: Pure JS for interactivity and API calls
- **Google Maps JavaScript API**: Interactive maps and location services
- **Responsive Design**: Mobile-first approach

### Database Design
- **Users Collection**: Authentication and profile data with geospatial indexing
- **Rides Collection**: Active ride sessions with location tracking
- **Ride Requests Collection**: Request management and status tracking
- **User Profiles Collection**: Extended profile information
- **Geospatial Indexing**: MongoDB 2dsphere indexes for location-based queries

### Architecture Features
- **RESTful API Design**: Clean, predictable API endpoints
- **JWT Authentication**: Secure token-based authentication
- **Real-time Polling**: Live updates for ride status and requests
- **Geospatial Queries**: Efficient nearby rider discovery
- **Smart Matching Algorithm**: Distance, rating, and route compatibility scoring

## ✨ Key Features Implemented

### 🔐 Authentication & Security
- **College Email Verification**: `@kristujayanti.com` domain restriction
- **JWT Token Authentication**: Secure session management
- **Password Encryption**: Bcrypt hashing for password security
- **Profile Completion Flow**: Mandatory profile setup for enhanced safety

### 🗺️ Location & Mapping
- **Interactive Google Maps Integration**: Real-time map with custom markers
- **Geolocation Services**: Automatic current location detection
- **Places Autocomplete**: Smart address input with Google Places API
- **Campus Quick Locations**: Pre-defined campus hotspots
- **Live Location Tracking**: Real-time driver location updates during rides

### 🤝 Community Features
- **Smart Ride Matching**: Algorithm considering distance, rating, and route compatibility
- **Cost-Sharing Calculator**: Fair cost distribution based on distance and fuel consumption
- **Rider Profiles**: Display college info, ratings, and ride history
- **Community Statistics**: Track CO₂ savings and social connections made
- **Personal Messages**: Riders can add friendly messages to requests

### 📱 Real-Time Experience
- **Live Status Updates**: Real-time ride request and status notifications
- **Driver Location Tracking**: Live map updates showing driver position
- **OTP Verification System**: Secure ride start verification
- **Auto-Refresh**: Automatic updates for available rides and requests
- **Status-Driven UI**: Interface adapts based on current ride status

### 🎨 User Experience
- **Map-First Design**: 70% map coverage inspired by modern ride apps
- **Floating Card Interface**: Clean, modern UI with floating action cards
- **Mobile-Responsive**: Optimized for mobile devices with touch-friendly controls
- **Progressive State Management**: UI adapts to ride progress (searching → matched → in-transit → completed)
- **Community-Focused Language**: Friendly terminology ("ride buddies" vs "passengers")

### 💡 Smart Algorithms
- **Distance-Based Matching**: Haversine formula for accurate distance calculations
- **Smart Score Calculation**: Weighted scoring combining distance, rating, and route efficiency
- **Cost-Sharing Model**: Transparent fuel cost distribution (₹5-8 per km with base fare)
- **Geospatial Queries**: MongoDB 2dsphere indexes for efficient location searches

### 🔔 Safety & Trust
- **College Verification**: Email domain validation ensures student community
- **Mutual Rating System**: Both riders and drivers rate each other
- **Emergency Contacts**: Optional emergency contact information
- **Ride History Tracking**: Complete journey logs for safety and accountability
- **Real-Time Tracking**: Live location sharing during active rides

## 📁 Project Structure

```
CampusPool/
├── backend/
│   ├── app/
│   │   ├── __init__.py           # Flask app factory
│   │   ├── api/
│   │   │   ├── auth.py           # Authentication endpoints
│   │   │   ├── rides.py          # Ride management
│   │   │   ├── maps.py           # Location services
│   │   │   └── profiles.py       # User profile management
│   │   ├── models/
│   │   │   ├── user_model.py     # User data models
│   │   │   └── ride_model.py     # Ride data models
│   │   └── utils/
│   │       ├── jwt_utils.py      # JWT authentication
│   │       └── distance_utils.py # Geospatial calculations
│   ├── config.py                 # Configuration settings
│   ├── run.py                    # Application entry point
│   └── setup_database.py         # Database initialization
├── frontend/
│   ├── templates/
│   │   ├── index.html            # Landing page
│   │   ├── rider_dashboard.html  # Rider interface
│   │   └── driver_dashboard.html # Driver interface
│   ├── static/
│   │   ├── css/
│   │   │   ├── style.css         # Landing page styles
│   │   │   └── dashboard.css     # Dashboard styles
│   │   └── js/
│   │       ├── script.js         # Landing page logic
│   │       ├── rider_dashboard.js # Rider functionality
│   │       └── driver_dashboard.js # Driver functionality
└── requirements.txt              # Python dependencies
```

## 🎯 Target Impact

### Environmental Benefits
- **Reduced Carbon Footprint**: Shared rides decrease individual vehicle usage
- **Campus Traffic Reduction**: Fewer vehicles on campus roads
- **Fuel Conservation**: Optimized ride sharing reduces overall fuel consumption

### Social Benefits
- **Community Building**: Students connect beyond academics
- **Cost Savings**: 50-70% savings compared to individual rides
- **Safety Enhancement**: Verified student community for trusted rides
- **Accessibility**: Affordable transportation for all economic backgrounds

### Technical Achievements
- **Real-Time Geospatial Processing**: Efficient location-based matching
- **Scalable Architecture**: MongoDB with proper indexing for growth
- **Mobile-First Design**: Optimized for smartphone usage
- **Modern UX Patterns**: Inspired by industry-leading ride apps

## 🔮 Future Enhancements

- **Push Notifications**: Real-time mobile notifications
- **In-App Chat**: Real-time messaging between riders
- **Route Optimization**: Multi-stop ride planning
- **Ride Scheduling**: Advanced booking for regular commutes
- **Loyalty Program**: Rewards for active community members
- **Admin Dashboard**: Campus administration tools and analytics

---

**CampusPool**: Building a sustainable, connected, and affordable campus transportation ecosystem through community-driven bike sharing. 🌱🚴‍♂️🎓


# ⚡ Installation & Setup

# 1. Clone the repository
git clone https://github.com/your-username/CampusPool.git
cd CampusPool

# 2. Create and activate a virtual environment
python -m venv venv
source venv/bin/activate   # On Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment variables
# 👉 Open backend/config.py and add:
#    - MongoDB connection string
#    - Google Maps API key

# 5. Initialize the database (first-time setup)
cd backend
python setup_database.py

# 6. Run the backend server
python run.py