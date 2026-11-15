// © 2026 Alexander Santos. All rights reserved. Proprietary software, see LICENSE.
'use strict';
const crypto = require('crypto');

const CATEGORIES = {
  Fruits: ['Apple', 'Banana', 'Orange', 'Mango', 'Grape', 'Pineapple', 'Strawberry', 'Watermelon', 'Cherry', 'Peach', 'Pear', 'Lemon', 'Coconut', 'Papaya', 'Kiwi', 'Plum', 'Blueberry', 'Pomegranate', 'Apricot', 'Guava'],
  Animals: ['Elephant', 'Giraffe', 'Penguin', 'Dolphin', 'Kangaroo', 'Tiger', 'Zebra', 'Octopus', 'Eagle', 'Crocodile', 'Rabbit', 'Camel', 'Turtle', 'Wolf', 'Gorilla', 'Butterfly', 'Hedgehog', 'Peacock', 'Squirrel', 'Shark'],
  Countries: ['Japan', 'Brazil', 'Canada', 'Egypt', 'Norway', 'Australia', 'Mexico', 'India', 'Italy', 'Kenya', 'Thailand', 'Argentina', 'Portugal', 'Vietnam', 'Greece', 'Peru', 'Sweden', 'Morocco', 'Ireland', 'Philippines'],
  Foods: ['Pizza', 'Sushi', 'Burger', 'Pasta', 'Omelette', 'Pancake', 'Taco', 'Curry', 'Sandwich', 'Dumpling', 'Salad', 'Noodles', 'Lasagna', 'Waffle', 'Burrito', 'Ramen', 'Steak', 'Soup', 'Popcorn', 'Cheesecake'],
  Sports: ['Basketball', 'Football', 'Tennis', 'Swimming', 'Volleyball', 'Badminton', 'Baseball', 'Boxing', 'Cycling', 'Golf', 'Hockey', 'Rugby', 'Archery', 'Surfing', 'Skiing', 'Gymnastics', 'Cricket', 'Wrestling', 'Karate', 'Bowling'],
  Professions: ['Doctor', 'Teacher', 'Pilot', 'Chef', 'Firefighter', 'Architect', 'Plumber', 'Farmer', 'Dentist', 'Lawyer', 'Journalist', 'Electrician', 'Mechanic', 'Librarian', 'Astronaut', 'Carpenter', 'Pharmacist', 'Photographer', 'Barber', 'Engineer'],
  'Household Items': ['Refrigerator', 'Umbrella', 'Mirror', 'Blanket', 'Scissors', 'Toothbrush', 'Pillow', 'Curtain', 'Kettle', 'Broom', 'Lamp', 'Candle', 'Backpack', 'Clock', 'Towel', 'Ladder', 'Hammer', 'Bucket', 'Sofa', 'Fan'],
  Vehicles: ['Bicycle', 'Helicopter', 'Submarine', 'Motorcycle', 'Tractor', 'Ambulance', 'Scooter', 'Ferry', 'Rocket', 'Tram', 'Canoe', 'Bulldozer', 'Taxi', 'Airplane', 'Skateboard', 'Truck', 'Train', 'Sailboat', 'Limousine', 'Jeepney']
};

const categoryNames = () => Object.keys(CATEGORIES);
const isValidCategory = name => Object.prototype.hasOwnProperty.call(CATEGORIES, name);

function pickWord(category) {
  const list = CATEGORIES[category];
  return list[crypto.randomInt(list.length)].toUpperCase();
}

module.exports = { categoryNames, isValidCategory, pickWord };
