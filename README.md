# PrepFuel v6

Mobile-first installable PWA for one-recipe / 14-meal weekly athlete meal prep.

## Exact default budget

The prior plan was $4.00 prepared meal + $0.46 produce per meal. Scaling both by 25% for a $2,500 school-year target gives:

- Prepared meal target: **$5.00 per meal**
- Produce allowance: **$0.575 per meal**
- Meals per week: **14**
- Prepared meals: **$70.00/week**
- Fruit + vegetables: **$8.05/week**
- Total: **$78.05/week**
- 32 weeks: **$2,497.60**
- Budget buffer: **$2.40**

## Online recipe updates

Recipes live in `data/recipes.json`. Recipe photos live in `images/`. The app fetches the recipe catalog with cache disabled when it opens/syncs, so future recipe commits update the same app without reinstalling it.

## GitHub Pages

Put these files at the repository root. In GitHub: Settings → Pages → Deploy from a branch → `main` → `/ (root)` → Save.

## iPhone install

Open the published URL in Safari → Share → Add to Home Screen → Add.
