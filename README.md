# Fuelr

Fuelr is a mobile-first installable PWA for personalized weekly meal planning.

## Core system

- Each user chooses **7, 14, or 21 prepared meals per week**
- Valid complete plans:
  - **7** = one 7-meal batch
  - **14** = 7 + 7 or one 14-meal batch
  - **21** = 7 + 7 + 7, 14 + 7, or one 21-meal batch
- Automatic ingredient scaling from any source serving count
- Every listed ingredient scales, including salt, spices, sauces, oils, seasonings, protein, carbs, vegetables, and toppings
- Recipe optimization toward the user's calculated per-meal budget cap
- The per-meal cap recalculates automatically when the user's weekly meal target changes
- Combined grocery list
- Weekly Prep board with meal-container completion tracking
- Recipe library loaded from `data/recipes.json`

## Default setup

Fuelr defaults to **14 meals per week**, so existing users who prep two meals per day keep the same setup.

With the default:
- School-year food budget: **$2,500**
- Academic weeks: **32**
- Meals per week: **14**
- Calculated meal cap: about **$5.58 per meal**
- Weekly meal budget: about **$78.13**

If the same $2,500 / 32-week user switches to 21 prepared meals per week, the weekly budget stays the same but the per-meal target becomes about **$3.72**.

## Personalization

Fuelr accounts can store:
- college theme
- school-year budget
- academic weeks
- 7 / 14 / 21 weekly prepared-meal target
- preferred and backup stores
- goal, dietary preferences, and allergies
- private personal recipes and recipe images
- weekly meal selections
- grocery completion
- prep progress

## Online updates

Recipes live in `data/recipes.json` and catalog recipe photos live in `images/`. Personal recipe data is stored in Supabase under the signed-in user's account.

## GitHub Pages

The current public build is deployed from the repository root on the `main` branch.

## iPhone install

Open the published app in Safari → Share → Add to Home Screen.
