# Fuelr

Fuelr is a mobile-first installable PWA for personalized weekly meal planning.

## Core system

- **14 meals per week**
- Choose **one 14-meal recipe** or **two 7-meal recipes**
- Automatic ingredient scaling from any source serving count
- Every listed ingredient scales, including salt, spices, sauces, oils, seasonings, protein, carbs, vegetables, and toppings
- Recipe optimization toward the user's calculated per-meal budget cap
- Combined grocery list
- Weekly Prep board with meal-container completion tracking
- Recipe library loaded from `data/recipes.json`

## Current default budget

- School-year food budget: **$2,500**
- Academic weeks: **32**
- Meals per week: **14**
- Calculated meal cap: about **$5.58 per meal**
- Weekly meal budget: about **$78.13**

The full food budget is allocated to meals; there is no separate produce allowance.

## Product direction

Fuelr is being expanded into a personalized multi-user meal system with onboarding, user accounts, college-based themes, personal recipes, cloud sync, and school-specific visual customization.

## Online updates

Recipes live in `data/recipes.json` and recipe photos live in `images/`. The app fetches the recipe catalog without caching when it opens or syncs.

## GitHub Pages

The current public build is deployed from the repository root on the `main` branch.

## iPhone install

Open the published app in Safari → Share → Add to Home Screen.
