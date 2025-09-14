import math

def calculate_haversine_distance(coords1, coords2):
    """
    Calculate the great circle distance between two points on Earth using the Haversine formula.
    This gives us the "as the crow flies" distance, perfect for fare estimation.
    
    Args:
        coords1: [longitude, latitude] of first point
        coords2: [longitude, latitude] of second point
    
    Returns:
        Distance in kilometers (float)
    """
    # Convert coordinates to radians
    lon1, lat1 = math.radians(coords1[0]), math.radians(coords1[1])
    lon2, lat2 = math.radians(coords2[0]), math.radians(coords2[1])
    
    # Haversine formula
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    
    # Radius of Earth in kilometers
    earth_radius_km = 6371.0
    
    distance = earth_radius_km * c
    return distance

def calculate_smart_score(distance_meters, driver_rating, max_distance_m=15000):
    """
    Calculate the Smart Match Score (0-100) combining distance and driver rating.
    Enhanced algorithm for better matching.
    
    Formula:
    - Distance component (0-60 points): Closer = higher points (exponential decay)
    - Rating component (0-40 points): Higher rating = higher points
    
    Args:
        distance_meters: Distance to driver in meters
        driver_rating: Driver's average rating (0-5)
        max_distance_m: Maximum search distance in meters
    
    Returns:
        Smart score (0-100)
    """
    # Distance component (0-60 points) with exponential decay for closer drivers
    # This gives much higher preference to very close drivers
    distance_ratio = min(distance_meters / max_distance_m, 1.0)
    distance_score = 60 * (1 - distance_ratio) * (2 - distance_ratio)  # Exponential curve
    
    # Rating component (0-40 points) 
    # Higher rated drivers get more points, with bonus for excellent ratings
    if driver_rating >= 4.5:
        rating_score = 40  # Perfect score for excellent drivers
    elif driver_rating >= 4.0:
        rating_score = 35 + (driver_rating - 4.0) * 10  # 35-40 points
    elif driver_rating >= 3.0:
        rating_score = 20 + (driver_rating - 3.0) * 15  # 20-35 points
    else:
        rating_score = max(0, driver_rating * 6.67)  # 0-20 points
    
    # Combine and round
    total_score = distance_score + rating_score
    return min(100, max(0, round(total_score)))

def calculate_cost_sharing_fare(distance_km):
    """
    Calculate cost-effective fare for ride sharing.
    Designed for college students sharing petrol costs.
    
    Cost breakdown:
    - Base fare: ₹15 (minimum charge)
    - Distance rate: ₹5-8 per km (sliding scale)
    - Maximum fare cap: ₹150 for long distances
    
    Args:
        distance_km: Distance in kilometers
    
    Returns:
        Fare in rupees (integer)
    """
    base_fare = 15
    
    if distance_km <= 0:
        return base_fare
    
    # Sliding rate structure - cheaper for longer distances
    if distance_km <= 5:
        # Short distances: ₹8 per km
        rate = 8
    elif distance_km <= 15:
        # Medium distances: ₹6 per km
        rate = 6
    else:
        # Long distances: ₹5 per km
        rate = 5
    
    # Calculate fare
    distance_fare = distance_km * rate
    total_fare = base_fare + distance_fare
    
    # Apply maximum cap for very long distances
    max_fare = 150
    final_fare = min(total_fare, max_fare)
    
    return max(base_fare, int(final_fare))

def calculate_fuel_cost_estimate(distance_km, fuel_efficiency_kmpl=40, fuel_price_per_liter=100):
    """
    Calculate actual fuel cost for transparency in cost-sharing.
    
    Args:
        distance_km: Distance in kilometers
        fuel_efficiency_kmpl: Vehicle fuel efficiency (km per liter)
        fuel_price_per_liter: Current fuel price per liter
    
    Returns:
        Dictionary with cost breakdown
    """
    # Round trip fuel consumption
    total_distance = distance_km * 2  # Assuming round trip
    fuel_needed = total_distance / fuel_efficiency_kmpl
    fuel_cost = fuel_needed * fuel_price_per_liter
    
    # Add wear and tear (approximately 10% of fuel cost)
    wear_tear_cost = fuel_cost * 0.1
    
    total_actual_cost = fuel_cost + wear_tear_cost
    
    return {
        "distance_km": distance_km,
        "round_trip_km": total_distance,
        "fuel_liters": round(fuel_needed, 2),
        "fuel_cost": round(fuel_cost, 2),
        "wear_tear_cost": round(wear_tear_cost, 2),
        "total_cost": round(total_actual_cost, 2),
        "suggested_share": round(total_actual_cost / 2, 2)  # Split between 2 people
    }

def get_distance_band(distance_km):
    """
    Categorize distance into bands for pricing and UI display.
    
    Args:
        distance_km: Distance in kilometers
    
    Returns:
        Dictionary with band information
    """
    if distance_km <= 2:
        return {
            "band": "very_close",
            "label": "Very Close",
            "description": "Within 2 km",
            "icon": "🟢",
            "priority": 1
        }
    elif distance_km <= 5:
        return {
            "band": "close",
            "label": "Close",
            "description": "2-5 km away",
            "icon": "🟡",
            "priority": 2
        }
    elif distance_km <= 10:
        return {
            "band": "moderate",
            "label": "Moderate",
            "description": "5-10 km away",
            "icon": "🟠",
            "priority": 3
        }
    else:
        return {
            "band": "far",
            "label": "Far",
            "description": "More than 10 km",
            "icon": "🔴",
            "priority": 4
        }

def get_college_coordinates():
    """
    Returns the coordinates of Kristu Jayanti College.
    """
    return [77.64038,13.05794]  # [longitude, latitude]

def get_college_address():
    """
    Returns the formatted address of Kristu Jayanti College.
    """
    return "Kristu Jayanti College, K Narayanapura, Kothanur, Bengaluru, Karnataka 560077, India"

def get_popular_destinations():
    """
    Returns a list of popular destinations for the college ride-sharing system.
    """
    return [
        {
            "name": "Kristu Jayanti College",
            "address": get_college_address(),
            "coordinates": get_college_coordinates(),
            "type": "college"
        },
        {
            "name": "Hebbal Bus Stop",
            "address": "Hebbal, Bengaluru, Karnataka",
            "coordinates": [77.5918, 13.0357],
            "type": "transport_hub"
        },
        {
            "name": "Manyata Tech Park",
            "address": "Manyata Embassy Business Park, Bengaluru, Karnataka",
            "coordinates": [77.6212, 13.0475],
            "type": "tech_park"
        },
        {
            "name": "Bangalore City Railway Station",
            "address": "Bangalore City Railway Station, Bengaluru, Karnataka",
            "coordinates": [77.5833, 12.9833],
            "type": "railway_station"
        },
        {
            "name": "Kempegowda International Airport",
            "address": "Kempegowda International Airport, Bengaluru, Karnataka",
            "coordinates": [77.7064, 13.1986],
            "type": "airport"
        }
    ]

def calculate_eta(distance_km, traffic_factor=1.2, avg_speed_kmh=25):
    """
    Calculate estimated time of arrival based on distance and traffic.
    
    Args:
        distance_km: Distance in kilometers
        traffic_factor: Traffic multiplier (1.0 = no traffic, 1.5 = heavy traffic)
        avg_speed_kmh: Average speed in km/h in city traffic
    
    Returns:
        ETA in minutes
    """
    # Adjust speed based on traffic
    effective_speed = avg_speed_kmh / traffic_factor
    
    # Calculate time in hours, then convert to minutes
    time_hours = distance_km / effective_speed
    time_minutes = time_hours * 60
    
    return max(5, round(time_minutes))  # Minimum 5 minutes

def get_route_efficiency_score(pickup_coords, destination_coords, driver_pickup, driver_destination):
    """
    Calculate how efficient it is for a driver to pick up a rider.
    Higher score means more efficient (less deviation from driver's route).
    
    Args:
        pickup_coords: Rider's pickup coordinates
        destination_coords: Rider's destination coordinates
        driver_pickup: Driver's starting point
        driver_destination: Driver's destination
    
    Returns:
        Efficiency score (0-100)
    """
    # Calculate direct distance for driver
    driver_direct_distance = calculate_haversine_distance(driver_pickup, driver_destination)
    
    # Calculate driver's route with pickup and drop
    driver_to_pickup = calculate_haversine_distance(driver_pickup, pickup_coords)
    pickup_to_drop = calculate_haversine_distance(pickup_coords, destination_coords)
    drop_to_driver_dest = calculate_haversine_distance(destination_coords, driver_destination)
    
    total_with_rider = driver_to_pickup + pickup_to_drop + drop_to_driver_dest
    
    # Calculate efficiency ratio
    if driver_direct_distance > 0:
        efficiency_ratio = driver_direct_distance / total_with_rider
        efficiency_score = min(100, efficiency_ratio * 100)
    else:
        efficiency_score = 50  # Default score
    
    return round(efficiency_score)